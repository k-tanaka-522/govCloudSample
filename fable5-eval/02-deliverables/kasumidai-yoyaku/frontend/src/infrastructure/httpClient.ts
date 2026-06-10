/**
 * HTTPクライアント共通部品(インフラ層)。
 * CSRF対策:状態変更リクエストにカスタムヘッダ X-Requested-With を付与(KSM-DEV-002 S-21)。
 * 認証はBFFのhttpOnly Cookie(KSM-ADR-004)のため credentials: 'include'。
 */

/** APIエラー(RFC 9457 Problem Details=KSM-DDD-001 §4.1)。 */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  [key: string]: unknown;
}

export class ApiError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.title ?? 'APIエラーが発生しました');
    this.problem = problem;
  }
}

const parseProblem = async (response: Response): Promise<ProblemDetails> => {
  try {
    return (await response.json()) as ProblemDetails;
  } catch {
    return { title: '通信エラーが発生しました', status: response.status };
  }
};

export const getJson = async <T>(path: string): Promise<T> => {
  const response = await fetch(path, { credentials: 'include' });
  if (!response.ok) {
    throw new ApiError(await parseProblem(response));
  }
  return (await response.json()) as T;
};

export const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(await parseProblem(response));
  }
  return (await response.json()) as T;
};
