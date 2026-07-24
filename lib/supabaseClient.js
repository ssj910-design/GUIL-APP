import { createClient } from "@supabase/supabase-js";

// .env.local 파일에 있는 두 값을 읽어옵니다.
// (이 파일은 Supabase와 대화하는 통로 하나를 만들어두는 것뿐이라,
//  실제 데이터를 읽고 쓰는 코드는 각 화면 컴포넌트에서 이 supabase를
//  import 해서 사용합니다.)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ★ write 공용 처리 — RLS가 꺼진 실운영 DB라 컬럼 오타·제약 위반이 조용히 실패하고 화면만 성공으로
// 보이는 사고가 있었다(P1-7). 쓰기는 이걸로 감싸고, false면 낙관적 setState를 건너뛴다.
//   if (!(await writeOk(supabase.from("x").update(p).eq("id", id), "저장 실패"))) return;
export async function writeOk(query, failMsg) {
  const { error } = await query;
  if (error) {
    alert(`${failMsg}\n${error.message ?? ""}`);
    return false;
  }
  return true;
}
