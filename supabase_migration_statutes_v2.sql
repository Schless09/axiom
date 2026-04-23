-- Axiom VLA — Statute DB expansion (run in Supabase SQL Editor)
--
-- Adds:
--   1. running_stop_sign rows for all 11 states already in the DB
--   2. Full 9-violation coverage for 11 additional high-volume states:
--      NJ, VA, AZ, CO, MN, TN, MO, IN, WI, SC, MD
--
-- Idempotent: skips rows where (state_code, statute_code) already exists.
-- Violation types must match the VIOLATION_TAGS list in lib/ai/vla-schemas.ts.

insert into public.statutes (state_code, statute_code, description, violation_type)
select v.*
from (
  values

    -- -------------------------------------------------------------------------
    -- PATCH: running_stop_sign for existing 11 states
    -- -------------------------------------------------------------------------

    -- Illinois
    ('IL', '625 ILCS 5/11-904',  'Obedience to stop sign — driver must stop at stop sign and yield before proceeding.', 'running_stop_sign'),

    -- Texas
    ('TX', 'TX Trans. Code §544.010', 'Stop signs and yield signs — operator must stop at stop sign and yield right-of-way before entering intersection.', 'running_stop_sign'),

    -- California
    ('CA', 'CA Veh. Code §22450',  'Stop requirements — driver approaching stop sign must stop at limit line or before entering crosswalk or intersection.', 'running_stop_sign'),

    -- Florida
    ('FL', 'FL Stat. §316.123',   'Vehicle entering stop intersection — driver must stop and yield before entering; applies to stop sign intersections.', 'running_stop_sign'),

    -- New York
    ('NY', 'NY VTL §1172',   'Obedience to stop signs — driver must stop at stop sign and yield before proceeding into intersection.', 'running_stop_sign'),

    -- Pennsylvania
    ('PA', '75 Pa. C.S. §3323', 'Stop signs and yield signs — operator must stop and yield before entering intersection controlled by stop sign.', 'running_stop_sign'),

    -- Ohio
    ('OH', 'ORC §4511.12', 'Traffic control devices — failure to obey stop sign or other official traffic control device.', 'running_stop_sign'),

    -- Georgia
    ('GA', 'OCGA §40-6-71',  'Obedience to stop signs — driver must stop at stop sign and yield before entering roadway.', 'running_stop_sign'),

    -- North Carolina
    ('NC', 'NCGS §20-158',   'Vehicle control signals — failure to stop and yield at stop sign-controlled intersection.', 'running_stop_sign'),

    -- Michigan
    ('MI', 'MCL §257.649', 'Stop signs; obedience — driver must stop at stop sign and yield before entering intersection.', 'running_stop_sign'),

    -- Washington
    ('WA', 'RCW §46.61.195', 'Stop signs — driver approaching stop sign must stop and yield right-of-way before entering intersection.', 'running_stop_sign'),

    -- -------------------------------------------------------------------------
    -- NEW STATE: New Jersey
    -- -------------------------------------------------------------------------
    ('NJ', 'NJS §39:4-98',    'Rate of speed — no person shall drive a vehicle on a highway at a speed greater than is reasonable and proper.', 'speeding'),
    ('NJ', 'NJS §39:4-88',    'Driving on marked lanes — vehicle shall be driven within a single lane; lane change only when safe.', 'lane_change'),
    ('NJ', 'NJS §39:4-90',    'Vehicles approaching or entering intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('NJ', 'NJS §39:4-85',    'Turning movements — improper position or method of turning; failure to signal.', 'improper_turn'),
    ('NJ', 'NJS §39:4-89',    'Space between vehicles — following more closely than is reasonable and prudent.', 'following_too_close'),
    ('NJ', 'NJS §39:4-81',    'Traffic signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('NJ', 'NJS §39:4-144',   'Stop signs — driver must stop at stop sign and yield before entering intersection.', 'running_stop_sign'),
    ('NJ', 'NJS §39:4-97.3',  'Using handheld mobile telephone while driving — distracted driving.', 'distracted_driving'),
    ('NJ', 'NJS §39:4-96',    'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- NEW STATE: Virginia
    -- -------------------------------------------------------------------------
    ('VA', 'VA Code §46.2-870',    'Maximum speed limits — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('VA', 'VA Code §46.2-804',    'Driving on right side; passing — failure to maintain lane or unsafe lane change.', 'lane_change'),
    ('VA', 'VA Code §46.2-821',    'When vehicle must stop — failure to yield right-of-way at intersection or to pedestrian.', 'failure_to_yield'),
    ('VA', 'VA Code §46.2-845',    'Signals required for turning, stopping, or decreasing speed — improper turn or failure to signal.', 'improper_turn'),
    ('VA', 'VA Code §46.2-816',    'Following too closely.', 'following_too_close'),
    ('VA', 'VA Code §46.2-833',    'Traffic lights — failure to obey red signal.', 'running_red_light'),
    ('VA', 'VA Code §46.2-820',    'Obedience to stop signs — driver must stop and yield at stop sign.', 'running_stop_sign'),
    ('VA', 'VA Code §46.2-1078.1', 'Use of handheld personal communications device while driving — distracted driving.', 'distracted_driving'),
    ('VA', 'VA Code §46.2-852',    'Reckless driving — driving in a manner endangering life, limb, or property.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- NEW STATE: Arizona
    -- -------------------------------------------------------------------------
    ('AZ', 'ARS §28-701',   'Reasonable and prudent speed; prima facie limits — driving at speed greater than reasonable for conditions.', 'speeding'),
    ('AZ', 'ARS §28-729',   'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('AZ', 'ARS §28-771',   'Vehicle entering highway from private road — failure to yield right-of-way.', 'failure_to_yield'),
    ('AZ', 'ARS §28-751',   'Required position and method of turning — improper turn at intersection.', 'improper_turn'),
    ('AZ', 'ARS §28-730',   'Following vehicle — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('AZ', 'ARS §28-645',   'Traffic control signals — failure to obey red light.', 'running_red_light'),
    ('AZ', 'ARS §28-855',   'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('AZ', 'ARS §28-914',   'Texting while driving — use of handheld device to read, write, or send messages while operating vehicle.', 'distracted_driving'),
    ('AZ', 'ARS §28-693',   'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- NEW STATE: Colorado
    -- -------------------------------------------------------------------------
    ('CO', 'CRS §42-4-1101', 'Speed limits — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('CO', 'CRS §42-4-1007', 'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('CO', 'CRS §42-4-703',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('CO', 'CRS §42-4-901',  'Required position and method of turning — improper turn at intersection.', 'improper_turn'),
    ('CO', 'CRS §42-4-1008', 'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('CO', 'CRS §42-4-603',  'Traffic control signals — failure to obey red light.', 'running_red_light'),
    ('CO', 'CRS §42-4-604',  'Stop signs — driver must stop at stop sign and yield before entering intersection.', 'running_stop_sign'),
    ('CO', 'CRS §42-4-239',  'Use of mobile electronic device while driving — distracted driving.', 'distracted_driving'),
    ('CO', 'CRS §42-4-1401', 'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- NEW STATE: Minnesota
    -- -------------------------------------------------------------------------
    ('MN', 'MN Stat. §169.14',       'Speed restrictions — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('MN', 'MN Stat. §169.18',       'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('MN', 'MN Stat. §169.20',       'Right-of-way — failure to yield at intersection or to pedestrian.', 'failure_to_yield'),
    ('MN', 'MN Stat. §169.19',       'Turning movements and required signals — improper turn or failure to signal.', 'improper_turn'),
    ('MN', 'MN Stat. §169.18 subd.8','Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('MN', 'MN Stat. §169.06',       'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('MN', 'MN Stat. §169.06 subd.5','Stop signs — driver must stop and yield before entering intersection.', 'running_stop_sign'),
    ('MN', 'MN Stat. §169.475',      'Use of wireless communications device while driving — distracted driving.', 'distracted_driving'),
    ('MN', 'MN Stat. §169.13',       'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- NEW STATE: Tennessee
    -- -------------------------------------------------------------------------
    ('TN', 'TCA §55-8-152',  'Speed restrictions — operating in excess of speed limit or at speed not reasonable for conditions.', 'speeding'),
    ('TN', 'TCA §55-8-123',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('TN', 'TCA §55-8-133',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('TN', 'TCA §55-8-143',  'Required position and method of turning — improper turn at intersection.', 'improper_turn'),
    ('TN', 'TCA §55-8-124',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('TN', 'TCA §55-8-110',  'Traffic control signals — failure to obey red light.', 'running_red_light'),
    ('TN', 'TCA §55-8-149',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('TN', 'TCA §55-8-199',  'Distracted driving — use of handheld mobile telephone or electronic device while driving.', 'distracted_driving'),
    ('TN', 'TCA §55-10-205', 'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- NEW STATE: Missouri
    -- -------------------------------------------------------------------------
    ('MO', 'MRS §304.010',  'Speed regulations — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('MO', 'MRS §304.015',  'Driving on right side; passing — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('MO', 'MRS §304.351',  'Failure to yield — vehicle entering roadway must yield to approaching traffic.', 'failure_to_yield'),
    ('MO', 'MRS §304.341',  'Turning movements — improper turn; failure to signal before turning.', 'improper_turn'),
    ('MO', 'MRS §304.017',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('MO', 'MRS §304.281',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('MO', 'MRS §300.290',  'Stop signs — driver must stop at stop sign and yield before entering intersection.', 'running_stop_sign'),
    ('MO', 'MRS §304.820',  'Use of wireless communication device while driving — distracted driving.', 'distracted_driving'),
    ('MO', 'MRS §304.012',  'Careless and imprudent driving — reckless operation of a vehicle.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- NEW STATE: Indiana
    -- -------------------------------------------------------------------------
    ('IN', 'IC 9-21-5-2',   'Maximum speed limits — operating in excess of posted speed limit or at speed not reasonable for conditions.', 'speeding'),
    ('IN', 'IC 9-21-8-6',   'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('IN', 'IC 9-21-8-30',  'Failure to yield right-of-way — vehicle entering intersection must yield to approaching traffic.', 'failure_to_yield'),
    ('IN', 'IC 9-21-8-22',  'Turning movements — improper turn or failure to signal.', 'improper_turn'),
    ('IN', 'IC 9-21-8-14',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('IN', 'IC 9-21-3-7',   'Traffic control signals — failure to obey red light.', 'running_red_light'),
    ('IN', 'IC 9-21-8-35',  'Stop signs — driver must stop at stop sign and yield before entering intersection.', 'running_stop_sign'),
    ('IN', 'IC 9-21-8-59',  'Use of telecommunications device while driving — distracted driving.', 'distracted_driving'),
    ('IN', 'IC 9-21-8-52',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- NEW STATE: Wisconsin
    -- -------------------------------------------------------------------------
    ('WI', 'WS §346.57',  'Speed restrictions — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('WI', 'WS §346.13',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('WI', 'WS §346.18',  'Failure to yield right-of-way — vehicle approaching intersection must yield to traffic already in intersection.', 'failure_to_yield'),
    ('WI', 'WS §346.31',  'Required position and method of turning — improper turn at intersection.', 'improper_turn'),
    ('WI', 'WS §346.14',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('WI', 'WS §346.37',  'Traffic control signals — failure to obey red light.', 'running_red_light'),
    ('WI', 'WS §346.46',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('WI', 'WS §346.89',  'Inattentive driving — operating while distracted by electronic device or other activity.', 'distracted_driving'),
    ('WI', 'WS §346.62',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- NEW STATE: South Carolina
    -- -------------------------------------------------------------------------
    ('SC', 'SC Code §56-5-1520', 'Maximum speed limits — driving in excess of posted speed limit or at speed not reasonable for conditions.', 'speeding'),
    ('SC', 'SC Code §56-5-1900', 'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('SC', 'SC Code §56-5-2330', 'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('SC', 'SC Code §56-5-2320', 'Required position and method of turning — improper turn at intersection.', 'improper_turn'),
    ('SC', 'SC Code §56-5-1930', 'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('SC', 'SC Code §56-5-970',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('SC', 'SC Code §56-5-1000', 'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('SC', 'SC Code §56-5-3890', 'Use of wireless electronic communication device while driving — distracted driving.', 'distracted_driving'),
    ('SC', 'SC Code §56-5-2920', 'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- NEW STATE: Maryland
    -- -------------------------------------------------------------------------
    ('MD', 'MD Trans. §21-801',    'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('MD', 'MD Trans. §21-309',    'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('MD', 'MD Trans. §21-403',    'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('MD', 'MD Trans. §21-601',    'Required position and method of turning — improper turn at intersection.', 'improper_turn'),
    ('MD', 'MD Trans. §21-310',    'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('MD', 'MD Trans. §21-202',    'Traffic control signals — failure to obey red light.', 'running_red_light'),
    ('MD', 'MD Trans. §21-707',    'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('MD', 'MD Trans. §21-1124.2', 'Use of handheld telephone or electronic device while driving — distracted driving.', 'distracted_driving'),
    ('MD', 'MD Trans. §21-901',    'Reckless driving.', 'reckless_driving')

) as v(state_code, statute_code, description, violation_type)
where not exists (
  select 1
  from public.statutes s
  where s.state_code = v.state_code and s.statute_code = v.statute_code
);
