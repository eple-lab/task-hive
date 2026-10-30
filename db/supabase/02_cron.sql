-- (선택) 완료 후 90일 지난 할 일을 매일 자동 삭제하는 예약 작업
-- 01_schema.sql을 실행한 뒤 SQL Editor에서 실행한다.
--
-- 이 파일을 실행하지 않아도, 서버가 사용자의 목록을 불러올 때마다 그 사용자의 지난 항목을 지운다.
-- 이 작업은 오래 접속하지 않은 사용자의 데이터까지 정리한다.

create extension if not exists pg_cron;

-- 매일 03:00 UTC (한국 시간 12:00). 같은 이름으로 다시 실행하면 일정이 덮어써진다
select cron.schedule(
  'task-hive-delete-old-todos',
  '0 3 * * *',
  $$ delete from public.todos where completed and completed_at <= now() - interval '90 days' $$
);

-- 등록 확인:   select * from cron.job;
-- 실행 기록:   select * from cron.job_run_details order by start_time desc limit 5;
-- 해제:        select cron.unschedule('task-hive-delete-old-todos');
