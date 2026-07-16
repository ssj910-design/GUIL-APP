import { createContext } from "react";


/* ------------------------------------------------------------------ */
/* Supabase 연동                                                        */
/* ------------------------------------------------------------------ */
// SITES는 파일 여러 곳(약 13곳)에서 전역 상수처럼 쓰이던 값이라,
// prop으로 일일이 넘기는 대신 Context로 어디서든 꺼내 쓸 수 있게 했습니다.
export const SitesContext = createContext([]);


// 로그인한 사용자 정보(이름/역할)와 전체 기사 이름 목록을 어디서든 꺼내 쓸 수 있게 합니다.
export const AuthContext = createContext({ name: "", role: "engineer", engineerNames: [], engineers: [], signOut: () => {} });
