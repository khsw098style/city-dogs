import { ApiError } from "./http.ts";

// 日本の携帯電話番号(090/080/070 + 8桁)。ハイフンの有無は問わない。
// 固定電話からの予約は電話受付のみを想定しているため、Web予約はモバイル番号限定にしている。
const JP_MOBILE_PHONE_RE = /^0[789]0-?\d{4}-?\d{4}$/;

export function isValidJpMobilePhone(phone: string): boolean {
  return JP_MOBILE_PHONE_RE.test(phone.trim());
}

export function normalizePhone(phone: string): string {
  return phone.replace(/-/g, "").trim();
}

// 厳密なRFC準拠チェックはせず、明らかな入力ミスだけを弾く実用的な緩さにしている
// (予約変更・キャンセルリンクの送信先として使えれば十分なため)。
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// manage_token等、uuid型カラムをクエリする前に形式チェックする。
// 不正な形式のままPostgRESTに投げるとDB側のエラー(invalid input syntax)になり、
// 「見つからない」ではなく500として扱われてしまうため、事前に弾く。
export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError("VALIDATION_ERROR", `${fieldName} を入力してください。`);
  }
  return value.trim();
}
