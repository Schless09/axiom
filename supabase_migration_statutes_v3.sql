-- Axiom VLA — Statute DB expansion v3 (run in Supabase SQL Editor after v2)
--
-- Adds full 9-violation coverage for the remaining 29 jurisdictions:
--   AL, AK, AR, CT, DE, DC, HI, ID, IA, KS, KY, LA, ME, MA,
--   MS, MT, NE, NV, NH, NM, ND, OK, OR, RI, SD, UT, VT, WV, WY
--
-- Sources: state motor vehicle / traffic codes as of 2025-2026.
-- Citations should be verified against current state law before use in litigation.
-- Idempotent: skips rows where (state_code, statute_code) already exists.

insert into public.statutes (state_code, statute_code, description, violation_type)
select v.*
from (
  values

    -- -------------------------------------------------------------------------
    -- Alabama
    -- -------------------------------------------------------------------------
    ('AL', 'Ala. Code §32-5A-170',  'Maximum speed limits — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('AL', 'Ala. Code §32-5A-88',   'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('AL', 'Ala. Code §32-5A-111',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('AL', 'Ala. Code §32-5A-132',  'Required position and method of turning at intersections — improper turn.', 'improper_turn'),
    ('AL', 'Ala. Code §32-5A-89',   'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('AL', 'Ala. Code §32-5A-31',   'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('AL', 'Ala. Code §32-5A-110',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('AL', 'Ala. Code §32-5A-350',  'Use of wireless telecommunications device while driving — distracted driving.', 'distracted_driving'),
    ('AL', 'Ala. Code §32-5A-190',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Alaska
    -- -------------------------------------------------------------------------
    ('AK', 'AS §28.35.030(a)',  'Reckless driving / unsafe speed — operating at speed greater than reasonable and prudent given conditions.', 'speeding'),
    ('AK', 'AS §28.35.035',     'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('AK', 'AS §28.35.185',     'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('AK', 'AS §28.35.095',     'Turning movements — improper turn or failure to signal before turning.', 'improper_turn'),
    ('AK', 'AS §28.35.085',     'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('AK', 'AS §28.35.182',     'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('AK', 'AS §28.35.183',     'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('AK', 'AS §28.35.161',     'Use of electronic communication device while driving — distracted driving.', 'distracted_driving'),
    ('AK', 'AS §28.35.040',     'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Arkansas
    -- -------------------------------------------------------------------------
    ('AR', 'AR Code §27-51-201',  'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('AR', 'AR Code §27-51-301',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('AR', 'AR Code §27-51-501',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('AR', 'AR Code §27-51-401',  'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('AR', 'AR Code §27-51-305',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('AR', 'AR Code §27-52-202',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('AR', 'AR Code §27-52-203',  'Stop signs — driver must stop at stop sign and yield before entering intersection.', 'running_stop_sign'),
    ('AR', 'AR Code §27-51-1504', 'Use of handheld wireless device while operating a motor vehicle — distracted driving.', 'distracted_driving'),
    ('AR', 'AR Code §27-50-308',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Connecticut
    -- -------------------------------------------------------------------------
    ('CT', 'CT Gen. Stat. §14-218a',   'Traveling unreasonably fast — driving at speed greater than reasonable given conditions or in excess of limit.', 'speeding'),
    ('CT', 'CT Gen. Stat. §14-236',    'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('CT', 'CT Gen. Stat. §14-245',    'Failure to grant right-of-way — failure to yield at intersection or to pedestrian.', 'failure_to_yield'),
    ('CT', 'CT Gen. Stat. §14-242',    'Turning movements — improper turn; failure to signal before turning.', 'improper_turn'),
    ('CT', 'CT Gen. Stat. §14-240',    'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('CT', 'CT Gen. Stat. §14-299',    'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('CT', 'CT Gen. Stat. §14-301',    'Stop signs — driver must stop at stop sign and yield before entering intersection.', 'running_stop_sign'),
    ('CT', 'CT Gen. Stat. §14-296aa',  'Use of mobile telephone or electronic device while driving — distracted driving.', 'distracted_driving'),
    ('CT', 'CT Gen. Stat. §14-222',    'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Delaware
    -- -------------------------------------------------------------------------
    ('DE', '21 Del. C. §4169',   'Maximum speed limits — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('DE', '21 Del. C. §4122',   'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('DE', '21 Del. C. §4131',   'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('DE', '21 Del. C. §4152',   'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('DE', '21 Del. C. §4123',   'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('DE', '21 Del. C. §4107',   'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('DE', '21 Del. C. §4130',   'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('DE', '21 Del. C. §4176C',  'Use of handheld mobile telephone while driving — distracted driving.', 'distracted_driving'),
    ('DE', '21 Del. C. §4175',   'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- District of Columbia
    -- -------------------------------------------------------------------------
    ('DC', 'DC Code §50-2201.04(b)',  'Speed limits — operating in excess of posted speed limit or at speed not reasonable for conditions.', 'speeding'),
    ('DC', 'DC Code §50-2201.06',     'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('DC', 'DC Code §50-2201.09',     'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('DC', 'DC Code §50-2201.12',     'Turning movements — improper turn or failure to signal before turning.', 'improper_turn'),
    ('DC', 'DC Code §50-2201.07',     'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('DC', 'DC Code §50-2201.03',     'Traffic control signals — failure to obey red light or traffic control signal.', 'running_red_light'),
    ('DC', 'DC Code §50-2201.03(b)',  'Stop signs — driver must stop at stop sign and yield before entering intersection.', 'running_stop_sign'),
    ('DC', 'DC Code §50-1731.04',     'Distracted driving — use of mobile telephone or electronic device while operating a vehicle.', 'distracted_driving'),
    ('DC', 'DC Code §50-2201.04(a)',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Hawaii
    -- -------------------------------------------------------------------------
    ('HI', 'HRS §291C-102',  'Noncompliance with speed limit — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('HI', 'HRS §291C-38',   'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('HI', 'HRS §291C-65',   'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('HI', 'HRS §291C-81',   'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('HI', 'HRS §291C-47',   'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('HI', 'HRS §291C-32',   'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('HI', 'HRS §291C-64',   'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('HI', 'HRS §291C-137',  'Use of mobile electronic device while operating a motor vehicle — distracted driving.', 'distracted_driving'),
    ('HI', 'HRS §291-2',     'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Idaho
    -- -------------------------------------------------------------------------
    ('ID', 'IC §49-654',    'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('ID', 'IC §49-637',    'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('ID', 'IC §49-801',    'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('ID', 'IC §49-644',    'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('ID', 'IC §49-638',    'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('ID', 'IC §49-804',    'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('ID', 'IC §49-802',    'Stop signs and yield signs — driver must stop at stop sign and yield before entering intersection.', 'running_stop_sign'),
    ('ID', 'IC §49-1401A',  'Use of wireless communication device while driving — distracted driving.', 'distracted_driving'),
    ('ID', 'IC §49-1401',   'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Iowa
    -- -------------------------------------------------------------------------
    ('IA', 'Iowa Code §321.285',  'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('IA', 'Iowa Code §321.306',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('IA', 'Iowa Code §321.319',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('IA', 'Iowa Code §321.311',  'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('IA', 'Iowa Code §321.307',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('IA', 'Iowa Code §321.257',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('IA', 'Iowa Code §321.322',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('IA', 'Iowa Code §321.276',  'Use of handheld electronic device while driving — distracted driving.', 'distracted_driving'),
    ('IA', 'Iowa Code §321.277',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Kansas
    -- -------------------------------------------------------------------------
    ('KS', 'KSA §8-1557',    'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('KS', 'KSA §8-1522',    'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('KS', 'KSA §8-1531',    'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('KS', 'KSA §8-1543',    'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('KS', 'KSA §8-1523',    'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('KS', 'KSA §8-1508',    'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('KS', 'KSA §8-1530',    'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('KS', 'KSA §8-15,111',  'Use of wireless communication device while driving — distracted driving.', 'distracted_driving'),
    ('KS', 'KSA §8-1566',    'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Kentucky
    -- -------------------------------------------------------------------------
    ('KY', 'KRS §189.390',  'Maximum speed limits — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('KY', 'KRS §189.300',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('KY', 'KRS §189.330',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('KY', 'KRS §189.380',  'Turning movements — improper turn or failure to signal before turning.', 'improper_turn'),
    ('KY', 'KRS §189.340',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('KY', 'KRS §189.231',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('KY', 'KRS §189.330(3)','Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('KY', 'KRS §189.292',  'Use of personal communication device while driving — distracted driving.', 'distracted_driving'),
    ('KY', 'KRS §189.290',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Louisiana
    -- -------------------------------------------------------------------------
    ('LA', 'LA RS §32:61',     'Maximum speed limit — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('LA', 'LA RS §32:79',     'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('LA', 'LA RS §32:121',    'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('LA', 'LA RS §32:101',    'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('LA', 'LA RS §32:81',     'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('LA', 'LA RS §32:232',    'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('LA', 'LA RS §32:123',    'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('LA', 'LA RS §32:300.5',  'Use of wireless telecommunications device while operating a motor vehicle — distracted driving.', 'distracted_driving'),
    ('LA', 'LA RS §14:99',     'Reckless operation of a vehicle.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Maine
    -- -------------------------------------------------------------------------
    ('ME', '29-A MRS §2074',  'Unreasonable speed — driving in excess of maximum limit or at speed not reasonable for conditions.', 'speeding'),
    ('ME', '29-A MRS §2051',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('ME', '29-A MRS §2056',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('ME', '29-A MRS §2071',  'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('ME', '29-A MRS §2053',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('ME', '29-A MRS §2057',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('ME', '29-A MRS §2058',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('ME', '29-A MRS §2119',  'Use of handheld wireless telephone while operating a motor vehicle — distracted driving.', 'distracted_driving'),
    ('ME', '29-A MRS §2413',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Massachusetts
    -- -------------------------------------------------------------------------
    ('MA', 'MGL c.90 §17',     'Maximum speed limits — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('MA', 'MGL c.89 §4A',     'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('MA', 'MGL c.89 §8',      'Vehicle entering intersection — failure to yield right-of-way to approaching vehicle.', 'failure_to_yield'),
    ('MA', 'MGL c.90 §14B',    'Turning movements — improper turn or failure to signal before turning.', 'improper_turn'),
    ('MA', 'MGL c.90 §14',     'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('MA', 'MGL c.89 §9',      'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('MA', 'MGL c.89 §9(b)',   'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('MA', 'MGL c.90 §13B',    'Use of handheld mobile telephone while operating a motor vehicle — distracted driving.', 'distracted_driving'),
    ('MA', 'MGL c.90 §24(2)(a)','Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Mississippi
    -- -------------------------------------------------------------------------
    ('MS', 'MS Code §63-3-509',  'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('MS', 'MS Code §63-3-603',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('MS', 'MS Code §63-3-805',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('MS', 'MS Code §63-3-701',  'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('MS', 'MS Code §63-3-619',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('MS', 'MS Code §63-3-309',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('MS', 'MS Code §63-3-809',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('MS', 'MS Code §63-33-1',   'Use of handheld wireless communication device while driving — distracted driving.', 'distracted_driving'),
    ('MS', 'MS Code §63-3-1201', 'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Montana
    -- -------------------------------------------------------------------------
    ('MT', 'MCA §61-8-303',  'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('MT', 'MCA §61-8-328',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('MT', 'MCA §61-8-346',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('MT', 'MCA §61-8-336',  'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('MT', 'MCA §61-8-329',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('MT', 'MCA §61-8-207',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('MT', 'MCA §61-8-344',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('MT', 'MCA §61-8-391',  'Use of wireless communication device while driving — distracted driving.', 'distracted_driving'),
    ('MT', 'MCA §61-8-301',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Nebraska
    -- -------------------------------------------------------------------------
    ('NE', 'Neb. Rev. Stat. §60-6,186',    'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('NE', 'Neb. Rev. Stat. §60-6,139',    'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('NE', 'Neb. Rev. Stat. §60-6,147',    'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('NE', 'Neb. Rev. Stat. §60-6,159',    'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('NE', 'Neb. Rev. Stat. §60-6,140',    'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('NE', 'Neb. Rev. Stat. §60-6,121',    'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('NE', 'Neb. Rev. Stat. §60-6,148',    'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('NE', 'Neb. Rev. Stat. §60-6,179.01', 'Use of handheld wireless communication device while driving — distracted driving.', 'distracted_driving'),
    ('NE', 'Neb. Rev. Stat. §60-6,213',    'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Nevada
    -- -------------------------------------------------------------------------
    ('NV', 'NRS §484B.600',  'Speed limits — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('NV', 'NRS §484B.223',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('NV', 'NRS §484B.257',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('NV', 'NRS §484B.300',  'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('NV', 'NRS §484B.230',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('NV', 'NRS §484B.307',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('NV', 'NRS §484B.253',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('NV', 'NRS §484B.165',  'Use of handheld wireless communication device while driving — distracted driving.', 'distracted_driving'),
    ('NV', 'NRS §484B.653',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- New Hampshire
    -- -------------------------------------------------------------------------
    ('NH', 'RSA §265:60',    'Speed limits — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('NH', 'RSA §265:16',    'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('NH', 'RSA §265:29',    'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('NH', 'RSA §265:44',    'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('NH', 'RSA §265:18',    'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('NH', 'RSA §265:14',    'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('NH', 'RSA §265:30',    'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('NH', 'RSA §265-A:14',  'Use of handheld mobile telephone while driving — distracted driving.', 'distracted_driving'),
    ('NH', 'RSA §265:79',    'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- New Mexico
    -- -------------------------------------------------------------------------
    ('NM', 'NMSA §66-7-301',  'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('NM', 'NMSA §66-7-317',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('NM', 'NMSA §66-7-325',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('NM', 'NMSA §66-7-344',  'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('NM', 'NMSA §66-7-318',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('NM', 'NMSA §66-7-105',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('NM', 'NMSA §66-7-324',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('NM', 'NMSA §66-7-374',  'Use of handheld wireless telephone while driving — distracted driving.', 'distracted_driving'),
    ('NM', 'NMSA §66-8-113',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- North Dakota
    -- -------------------------------------------------------------------------
    ('ND', 'NDCC §39-09-01',  'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('ND', 'NDCC §39-10-27',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('ND', 'NDCC §39-10-34',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('ND', 'NDCC §39-10-44',  'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('ND', 'NDCC §39-10-29',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('ND', 'NDCC §39-10-07',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('ND', 'NDCC §39-10-33',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('ND', 'NDCC §39-08-23',  'Use of electronic device while driving — distracted driving.', 'distracted_driving'),
    ('ND', 'NDCC §39-08-03',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Oklahoma
    -- -------------------------------------------------------------------------
    ('OK', '47 OS §11-801',   'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('OK', '47 OS §11-309',   'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('OK', '47 OS §11-401',   'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('OK', '47 OS §11-601',   'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('OK', '47 OS §11-310',   'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('OK', '47 OS §11-202',   'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('OK', '47 OS §11-403',   'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('OK', '47 OS §11-901d',  'Use of handheld mobile telephone while driving — distracted driving.', 'distracted_driving'),
    ('OK', '47 OS §11-901',   'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Oregon
    -- -------------------------------------------------------------------------
    ('OR', 'ORS §811.100',  'Violation of a speed limit — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('OR', 'ORS §811.370',  'Unsafe lane change — failure to maintain lane; unsafe movement between lanes.', 'lane_change'),
    ('OR', 'ORS §811.260',  'Failure to yield to driver on right — failure to yield right-of-way at intersection.', 'failure_to_yield'),
    ('OR', 'ORS §811.335',  'Improper turn — making turn from wrong position or without signaling.', 'improper_turn'),
    ('OR', 'ORS §811.485',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('OR', 'ORS §811.265',  'Failure to obey traffic control device — running red light or disobeying traffic signal.', 'running_red_light'),
    ('OR', 'ORS §811.270',  'Failure to stop at stop sign — driver must stop and yield before entering intersection.', 'running_stop_sign'),
    ('OR', 'ORS §811.507',  'Driving while using mobile communication device — distracted driving.', 'distracted_driving'),
    ('OR', 'ORS §811.140',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Rhode Island
    -- -------------------------------------------------------------------------
    ('RI', 'RI Gen. Laws §31-14-1',   'Speed limits — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('RI', 'RI Gen. Laws §31-15-5',   'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('RI', 'RI Gen. Laws §31-17-1',   'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('RI', 'RI Gen. Laws §31-16-1',   'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('RI', 'RI Gen. Laws §31-15-6',   'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('RI', 'RI Gen. Laws §31-13-1',   'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('RI', 'RI Gen. Laws §31-13-4',   'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('RI', 'RI Gen. Laws §31-22-30',  'Use of electronic device while driving — distracted driving.', 'distracted_driving'),
    ('RI', 'RI Gen. Laws §31-27-4',   'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- South Dakota
    -- -------------------------------------------------------------------------
    ('SD', 'SDCL §32-25-1',   'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('SD', 'SDCL §32-26-9',   'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('SD', 'SDCL §32-26-18',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('SD', 'SDCL §32-26-30',  'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('SD', 'SDCL §32-26-11',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('SD', 'SDCL §32-27-3',   'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('SD', 'SDCL §32-26-17',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('SD', 'SDCL §32-26-48',  'Use of wireless communication device while driving — distracted driving.', 'distracted_driving'),
    ('SD', 'SDCL §32-24-1',   'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Utah
    -- -------------------------------------------------------------------------
    ('UT', 'Utah Code §41-6a-601',  'Maximum speed limit — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('UT', 'Utah Code §41-6a-709',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('UT', 'Utah Code §41-6a-901',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('UT', 'Utah Code §41-6a-801',  'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('UT', 'Utah Code §41-6a-711',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('UT', 'Utah Code §41-6a-305',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('UT', 'Utah Code §41-6a-903',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('UT', 'Utah Code §41-6a-1716', 'Use of handheld wireless communication device while driving — distracted driving.', 'distracted_driving'),
    ('UT', 'Utah Code §41-6a-528',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Vermont
    -- -------------------------------------------------------------------------
    ('VT', '23 VSA §1081',  'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('VT', '23 VSA §1034',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('VT', '23 VSA §1050',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('VT', '23 VSA §1063',  'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('VT', '23 VSA §1035',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('VT', '23 VSA §1017',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('VT', '23 VSA §1052',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('VT', '23 VSA §1099',  'Use of handheld mobile telephone while driving — distracted driving.', 'distracted_driving'),
    ('VT', '23 VSA §1091',  'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- West Virginia
    -- -------------------------------------------------------------------------
    ('WV', 'WV Code §17C-6-1',    'Speed restrictions — driving in excess of maximum speed or at speed not reasonable for conditions.', 'speeding'),
    ('WV', 'WV Code §17C-7-9',    'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('WV', 'WV Code §17C-13-1',   'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('WV', 'WV Code §17C-8-7',    'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('WV', 'WV Code §17C-7-10',   'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('WV', 'WV Code §17C-3-6',    'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('WV', 'WV Code §17C-13-2',   'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('WV', 'WV Code §17C-14A-2',  'Use of wireless communication device while driving — distracted driving.', 'distracted_driving'),
    ('WV', 'WV Code §17C-5-3',    'Reckless driving.', 'reckless_driving'),

    -- -------------------------------------------------------------------------
    -- Wyoming
    -- -------------------------------------------------------------------------
    ('WY', 'WS §31-5-301',  'Maximum speed limits — driving in excess of posted limit or at speed not reasonable for conditions.', 'speeding'),
    ('WY', 'WS §31-5-209',  'Driving on roadways laned for traffic — failure to maintain lane; unsafe lane change.', 'lane_change'),
    ('WY', 'WS §31-5-221',  'Vehicle entering stop or yield intersection — failure to yield right-of-way.', 'failure_to_yield'),
    ('WY', 'WS §31-5-218',  'Required position and method of turning — improper turn or failure to signal.', 'improper_turn'),
    ('WY', 'WS §31-5-210',  'Following too closely — following another vehicle more closely than is reasonable and prudent.', 'following_too_close'),
    ('WY', 'WS §31-5-206',  'Traffic control signals — failure to obey red light or traffic signal.', 'running_red_light'),
    ('WY', 'WS §31-5-220',  'Stop signs — driver approaching stop sign must stop and yield before entering intersection.', 'running_stop_sign'),
    ('WY', 'WS §31-5-237',  'Use of handheld mobile device while driving — distracted driving.', 'distracted_driving'),
    ('WY', 'WS §31-5-229',  'Reckless driving.', 'reckless_driving')

) as v(state_code, statute_code, description, violation_type)
where not exists (
  select 1
  from public.statutes s
  where s.state_code = v.state_code and s.statute_code = v.statute_code
);
