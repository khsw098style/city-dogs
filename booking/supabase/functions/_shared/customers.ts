import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ApiError } from "./http.ts";
import { normalizePhone } from "./validation.ts";

interface UpsertCustomerInput {
  name: string;
  nameKana: string | null;
  phone: string;
  email: string | null;
}

// 電話番号をキーに顧客をUPSERTする(既存なら氏名・カナを更新して再利用、初回なら新規作成)。
// 公開予約(POST /reservations)・電話予約の代理登録(POST /admin-reservations)の両方から使う。
// emailは未入力(null)の場合、既存の値を消さない(電話予約はemail不明のことが多いため)。
export async function upsertCustomerByPhone(
  client: SupabaseClient,
  input: UpsertCustomerInput,
): Promise<string> {
  const normalizedPhone = normalizePhone(input.phone);

  const { data: existing, error: findErr } = await client
    .from("customers")
    .select("id")
    .eq("phone", normalizedPhone)
    .maybeSingle();
  if (findErr) throw new ApiError("INTERNAL_ERROR", "顧客情報の照会に失敗しました。");

  if (existing) {
    const patch: Record<string, unknown> = { name: input.name, name_kana: input.nameKana };
    if (input.email) patch.email = input.email;
    const { error: updateErr } = await client.from("customers").update(patch).eq("id", existing.id);
    if (updateErr) throw new ApiError("INTERNAL_ERROR", "顧客情報の更新に失敗しました。");
    return existing.id;
  }

  const { data: created, error: createErr } = await client
    .from("customers")
    .insert({ name: input.name, name_kana: input.nameKana, phone: normalizedPhone, email: input.email })
    .select("id")
    .single();
  if (createErr || !created) throw new ApiError("INTERNAL_ERROR", "顧客情報の登録に失敗しました。");
  return created.id;
}
