-- Axiom VLA — seed data (run in Supabase SQL Editor after supabase_schema.sql)
-- New signups: each user gets a personal org + membership via DB trigger
-- (`handle_provision_org_for_new_user` in supabase_schema.sql). You do not need to
-- insert user_org_memberships by hand for new accounts.

-- -----------------------------------------------------------------------------
-- Organization (fixed id so paths and docs stay consistent — optional shared demo tenant)
-- -----------------------------------------------------------------------------
insert into public.organizations (id, name, slug)
values (
  '00000000-0000-0000-0000-000000000001',
  'Pilot Org',
  'pilot'
)
on conflict (id) do nothing;

-- If your table used gen_random_uuid() only and slug conflicts, use:
-- on conflict (slug) do update set name = excluded.name;

-- -----------------------------------------------------------------------------
-- Optional: link specific users to Pilot Org (shared demo / TPA sandbox)
-- Skip for normal use — each user already has their own org from the signup trigger.
-- -----------------------------------------------------------------------------
-- insert into public.user_org_memberships (user_id, org_id)
-- select id, '00000000-0000-0000-0000-000000000001'::uuid
-- from auth.users
-- where email = 'your-email@example.com'
-- on conflict (user_id, org_id) do nothing;

-- -----------------------------------------------------------------------------
-- Sample statutes (IL) — tune to your legal source of truth; powers statute matcher
-- -----------------------------------------------------------------------------
insert into public.statutes (state_code, statute_code, description, violation_type)
select v.*
from (
  values
    -- Illinois
    ('IL', '625 ILCS 5/11-601',  'General speed restrictions — driving at a speed greater than is reasonable and proper with regard to traffic conditions.', 'speeding'),
    ('IL', '625 ILCS 5/11-709',  'Driving within a single lane — failure to maintain lane / improper lane usage where marked.', 'lane_change'),
    ('IL', '625 ILCS 5/11-902',  'Vehicle approaching or entering a roadway — yield to traffic on the roadway (failure to yield).', 'failure_to_yield'),
    ('IL', '625 ILCS 5/11-903',  'Turning movements — improper turn / turn signal / turning from wrong lane where applicable.', 'improper_turn'),
    ('IL', '625 ILCS 5/11-710',  'Following too closely.', 'following_too_close'),
    ('IL', '625 ILCS 5/11-306',  'Obedience to traffic control devices — failure to stop at red light / traffic signal violation.', 'running_red_light'),
    ('IL', '625 ILCS 5/11-1431', 'Use of electronic communication devices while driving — distracted driving / texting while driving.', 'distracted_driving'),
    ('IL', '625 ILCS 5/11-503',  'Reckless driving.', 'reckless_driving'),

    -- Texas
    ('TX', 'TX Trans. Code §545.351', 'Maximum speed requirement — operating a vehicle at a speed greater than is reasonable and prudent under the circumstances.', 'speeding'),
    ('TX', 'TX Trans. Code §545.060', 'Driving on roadway laned for traffic — failure to maintain lane / unsafe lane change.', 'lane_change'),
    ('TX', 'TX Trans. Code §545.151', 'Vehicle entering highway from private road or driveway — failure to yield to approaching traffic.', 'failure_to_yield'),
    ('TX', 'TX Trans. Code §545.101', 'Turning at intersection — improper position, method of turning, or failure to signal.', 'improper_turn'),
    ('TX', 'TX Trans. Code §545.062', 'Following distance — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('TX', 'TX Trans. Code §544.007', 'Traffic signals — failure to obey red light or traffic control signal.', 'running_red_light'),
    ('TX', 'TX Trans. Code §545.4251','Use of wireless communication device — texting or handheld use while driving.', 'distracted_driving'),
    ('TX', 'TX Trans. Code §545.401', 'Reckless driving.', 'reckless_driving'),

    -- California
    ('CA', 'CA Veh. Code §22350',  'Basic speed law — no person shall drive a vehicle upon a highway at a speed greater than is reasonable or prudent.', 'speeding'),
    ('CA', 'CA Veh. Code §21658',  'Laned roadways — unsafe lane change; failure to maintain lane.', 'lane_change'),
    ('CA', 'CA Veh. Code §21802',  'Stop intersections; yield right-of-way — failure to yield before entering intersection controlled by stop sign.', 'failure_to_yield'),
    ('CA', 'CA Veh. Code §22107',  'Turning movements and required signals — unsafe turn or lane change without signaling.', 'improper_turn'),
    ('CA', 'CA Veh. Code §21703',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('CA', 'CA Veh. Code §21453',  'Traffic signals — failure to stop at steady circular red signal.', 'running_red_light'),
    ('CA', 'CA Veh. Code §23123.5','Driving while holding and operating handheld wireless telephone or mobile device.', 'distracted_driving'),
    ('CA', 'CA Veh. Code §23103',  'Reckless driving.', 'reckless_driving'),

    -- Florida
    ('FL', 'FL Stat. §316.183',   'Unlawful speed — driving at a speed in excess of maximum limits or not reasonable given conditions.', 'speeding'),
    ('FL', 'FL Stat. §316.089',   'Failure to maintain single lane — moving from lane of traffic without safety and signal.', 'lane_change'),
    ('FL', 'FL Stat. §316.123',   'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('FL', 'FL Stat. §316.151',   'Required position and method of turning — improper turn at intersection.', 'improper_turn'),
    ('FL', 'FL Stat. §316.0895',  'Following too closely.', 'following_too_close'),
    ('FL', 'FL Stat. §316.074',   'Obedience to traffic control devices — failure to obey red light or signal.', 'running_red_light'),
    ('FL', 'FL Stat. §316.305',   'Wireless communications devices — texting while driving.', 'distracted_driving'),
    ('FL', 'FL Stat. §316.192',   'Reckless driving.', 'reckless_driving'),

    -- New York
    ('NY', 'NY VTL §1180',   'Basic rule and maximum limits — driving at a speed not reasonable under conditions or exceeding maximum.', 'speeding'),
    ('NY', 'NY VTL §1128',   'Driving on roadways laned for traffic — unsafe lane change / failure to maintain lane.', 'lane_change'),
    ('NY', 'NY VTL §1142',   'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('NY', 'NY VTL §1163',   'Turning movements and required signals — improper turn; failure to signal.', 'improper_turn'),
    ('NY', 'NY VTL §1129',   'Following too closely.', 'following_too_close'),
    ('NY', 'NY VTL §1111',   'Traffic control signals — disobeying red light or traffic signal.', 'running_red_light'),
    ('NY', 'NY VTL §1225-d', 'Use of mobile telephone / portable electronic device while driving.', 'distracted_driving'),
    ('NY', 'NY VTL §1212',   'Reckless driving.', 'reckless_driving'),

    -- Pennsylvania
    ('PA', '75 Pa. C.S. §3361', 'Driving vehicle at safe speed — speed greater than reasonable and proper under conditions.', 'speeding'),
    ('PA', '75 Pa. C.S. §3309', 'Driving on roadways laned for traffic — unsafe lane change / failure to maintain lane.', 'lane_change'),
    ('PA', '75 Pa. C.S. §3323', 'Stop signs and yield signs — failure to yield right-of-way at intersection.', 'failure_to_yield'),
    ('PA', '75 Pa. C.S. §3331', 'Required position and method of turning — improper turn.', 'improper_turn'),
    ('PA', '75 Pa. C.S. §3310', 'Following too closely.', 'following_too_close'),
    ('PA', '75 Pa. C.S. §3112', 'Traffic-control signals — failure to obey red light.', 'running_red_light'),
    ('PA', '75 Pa. C.S. §3316', 'Use of interactive wireless communication device — texting / handheld use while driving.', 'distracted_driving'),
    ('PA', '75 Pa. C.S. §3736', 'Reckless driving.', 'reckless_driving'),

    -- Ohio
    ('OH', 'ORC §4511.21', 'Speed limits — operating above posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('OH', 'ORC §4511.33', 'Rules for driving in marked lanes — failure to maintain lane / unsafe lane change.', 'lane_change'),
    ('OH', 'ORC §4511.43', 'Failure to yield right-of-way at stop or yield sign.', 'failure_to_yield'),
    ('OH', 'ORC §4511.36', 'Rules for turns at intersections — improper turn.', 'improper_turn'),
    ('OH', 'ORC §4511.34', 'Space between vehicles — following too closely.', 'following_too_close'),
    ('OH', 'ORC §4511.13', 'Traffic control signal — disobeying red light.', 'running_red_light'),
    ('OH', 'ORC §4511.204','Using electronic wireless communications device while driving.', 'distracted_driving'),
    ('OH', 'ORC §4511.20', 'Reckless operation of vehicles.', 'reckless_driving'),

    -- Georgia
    ('GA', 'OCGA §40-6-181', 'Maximum speed limits — driving in excess of posted or prima facie limit.', 'speeding'),
    ('GA', 'OCGA §40-6-48',  'Driving on roadways laned for traffic — failure to maintain lane / unsafe lane change.', 'lane_change'),
    ('GA', 'OCGA §40-6-72',  'Failure to yield right-of-way at yield sign or when entering roadway.', 'failure_to_yield'),
    ('GA', 'OCGA §40-6-120', 'Required position and method of turning at intersections — improper turn.', 'improper_turn'),
    ('GA', 'OCGA §40-6-49',  'Following too closely.', 'following_too_close'),
    ('GA', 'OCGA §40-6-20',  'Obedience to traffic control devices — failure to comply with red light.', 'running_red_light'),
    ('GA', 'OCGA §40-6-241', 'Using wireless telecommunications device while driving — distracted driving.', 'distracted_driving'),
    ('GA', 'OCGA §40-6-390', 'Reckless driving.', 'reckless_driving'),

    -- North Carolina
    ('NC', 'NCGS §20-141',   'Speed restrictions — driving at speed in excess of limit or unreasonable given conditions.', 'speeding'),
    ('NC', 'NCGS §20-146',   'Drive on right side of highway; lane discipline — failure to maintain lane.', 'lane_change'),
    ('NC', 'NCGS §20-158',   'Vehicle control signals — failure to yield or stop at traffic signal.', 'failure_to_yield'),
    ('NC', 'NCGS §20-153',   'Turning at intersections — improper turn.', 'improper_turn'),
    ('NC', 'NCGS §20-152',   'Following too closely.', 'following_too_close'),
    ('NC', 'NCGS §20-158',   'Traffic signals — running red light or disobeying traffic control signal.', 'running_red_light'),
    ('NC', 'NCGS §20-137.4A','Driving while using mobile telephone or handheld device — distracted driving.', 'distracted_driving'),
    ('NC', 'NCGS §20-140',   'Reckless driving.', 'reckless_driving'),

    -- Michigan
    ('MI', 'MCL §257.628', 'Speed restrictions — exceeding posted speed limit or driving at speed unreasonable for conditions.', 'speeding'),
    ('MI', 'MCL §257.642', 'Driving in single lane — unsafe lane change / failure to stay within marked lane.', 'lane_change'),
    ('MI', 'MCL §257.650', 'Failure to yield right-of-way to traffic on through highway.', 'failure_to_yield'),
    ('MI', 'MCL §257.648', 'Turning; signals — improper turn or failure to signal before turning.', 'improper_turn'),
    ('MI', 'MCL §257.643', 'Following too closely.', 'following_too_close'),
    ('MI', 'MCL §257.612', 'Traffic control signals — disobeying red light.', 'running_red_light'),
    ('MI', 'MCL §257.602b','Using mobile electronic device while driving — distracted driving.', 'distracted_driving'),
    ('MI', 'MCL §257.626', 'Reckless driving.', 'reckless_driving'),

    -- Washington
    ('WA', 'RCW §46.61.400', 'Basic rule and maximum limits — speed not reasonable and prudent given conditions.', 'speeding'),
    ('WA', 'RCW §46.61.140', 'Driving on roadways laned for traffic — unsafe lane change / failure to maintain lane.', 'lane_change'),
    ('WA', 'RCW §46.61.190', 'Stop signs and yield signs — failure to yield right-of-way.', 'failure_to_yield'),
    ('WA', 'RCW §46.61.290', 'Required position and method of turning — improper turn.', 'improper_turn'),
    ('WA', 'RCW §46.61.145', 'Following too closely.', 'following_too_close'),
    ('WA', 'RCW §46.61.055', 'Traffic control devices — disobeying red light or traffic signal.', 'running_red_light'),
    ('WA', 'RCW §46.61.672', 'Using handheld mobile device while driving — distracted driving.', 'distracted_driving'),
    ('WA', 'RCW §46.61.500', 'Reckless driving.', 'reckless_driving')

) as v(state_code, statute_code, description, violation_type)
where not exists (
  select 1
  from public.statutes s
  where s.state_code = v.state_code and s.statute_code = v.statute_code
);
