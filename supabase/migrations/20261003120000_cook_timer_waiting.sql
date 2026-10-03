-- The timer of a cook waits for the water to reach the set point, as in the Anova app:
-- Start sets it, and the server starts it once the water is there.
alter table public.cooks add column timer_waiting boolean not null default false;
comment on column public.cooks.timer_waiting is 'The timer is set but waits for the set point; the server starts it then.';
