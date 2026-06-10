package jp.lg.kasumidai.yoyaku.presentation.error;

import jp.lg.kasumidai.yoyaku.domain.common.DomainException;
import jp.lg.kasumidai.yoyaku.domain.reservation.SlotConflictException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 共通例外ハンドラ(一元化。KSM-DEV-002 S-23)。
 * エラーはRFC 9457(Problem Details)形式で統一し(KSM-DDD-001 §4.1)、
 * スタックトレース・内部情報を応答に含めない。Controller内のtry-catchは禁止(ArchUnit検査対象)。
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

  private static final String PROBLEM_TYPE_BASE = "https://yoyaku.city.kasumidai.lg.jp/problems/";

  /** 一括予約の全件不成立(409+不成立コマ全件一覧=KSM-DDD-001 §4.4)。 */
  @ExceptionHandler(SlotConflictException.class)
  public ProblemDetail handleSlotConflict(SlotConflictException e) {
    ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.CONFLICT);
    problem.setType(java.net.URI.create(PROBLEM_TYPE_BASE + e.getProblemType()));
    problem.setTitle(e.getMessage());
    problem.setProperty(
        "conflictItems",
        e.getConflicts().stream()
            .map(
                c ->
                    java.util.Map.of(
                        "unitId", c.slot().unitId(),
                        "useDate", c.slot().useDate().toString(),
                        "slotId", c.slot().slotId(),
                        "reason", c.reason().name()))
            .toList());
    return problem;
  }

  /** 業務例外(422)。 */
  @ExceptionHandler(DomainException.class)
  public ProblemDetail handleDomain(DomainException e) {
    ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.UNPROCESSABLE_ENTITY);
    problem.setType(java.net.URI.create(PROBLEM_TYPE_BASE + e.getProblemType()));
    problem.setTitle(e.getMessage());
    return problem;
  }

  /** 入力検証エラー(400。KSM-DEV-002 S-53:エラー特定と修正提案=REQ-014)。 */
  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ProblemDetail handleValidation(MethodArgumentNotValidException e) {
    ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
    problem.setType(java.net.URI.create(PROBLEM_TYPE_BASE + "validation-error"));
    problem.setTitle("入力内容に誤りがあります");
    problem.setProperty(
        "fields",
        e.getBindingResult().getFieldErrors().stream()
            .map(f -> java.util.Map.of("field", f.getField(), "message", String.valueOf(f.getDefaultMessage())))
            .toList());
    return problem;
  }

  /** 技術例外(500。内部情報は返さない=S-23。詳細はサーバログのみ)。 */
  @ExceptionHandler(Exception.class)
  public ProblemDetail handleUnexpected(Exception e) {
    ProblemDetail problem = ProblemDetail.forStatus(HttpStatus.INTERNAL_SERVER_ERROR);
    problem.setType(java.net.URI.create(PROBLEM_TYPE_BASE + "internal-error"));
    problem.setTitle("システムエラーが発生しました。時間をおいて再度お試しください");
    return problem;
  }
}
