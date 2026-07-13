import { createClient } from "@supabase/supabase-js";

// .env.local 파일에 있는 두 값을 읽어옵니다.
// (이 파일은 Supabase와 대화하는 통로 하나를 만들어두는 것뿐이라,
//  실제 데이터를 읽고 쓰는 코드는 각 화면 컴포넌트에서 이 supabase를
//  import 해서 사용합니다.)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
