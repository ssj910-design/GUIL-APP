-- 096: 게시판 종알림을 "게시판 탭 방문"이 아니라 "그 글을 열어봄" 기준으로 바꾸면서,
-- 이미 존재하는 과거 글들이 전부 "안 읽은 알림"으로 한꺼번에 되살아나는 걸 막기 위한 백필 (2026-08-01)
-- 지금까지 게시판 알림은 게시판 탭만 들어가도 전부 읽음 처리됐어서, 종(🔔) 드롭다운에서 직접
-- 눌러본 글이 아니면 dismissed_notif_ids에 "post:id"가 기록된 적이 없다. 이번 변경으로 그 필드만
-- 보고 판단하게 되므로, 배포 시점까지 있던 글은 전부 이미 본 것으로 미리 채워둔다(추가만 함, 삭제 없음).
-- 이후 새로 올라오는 @멘션·공지 글부터는 정상적으로 안 읽음으로 잡힌다.

update public.profiles p
set dismissed_notif_ids = (
  select array(
    select distinct x from unnest(
      coalesce(p.dismissed_notif_ids, '{}'::text[])
      || coalesce((select array_agg('post:' || fp.id) from public.feed_posts fp), '{}'::text[])
    ) as x
  )
);
