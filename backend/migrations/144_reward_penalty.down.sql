DROP TABLE IF EXISTS staff_reward_penalty;
DROP TABLE IF EXISTS kpi_rules;

DELETE FROM enum_options eo USING enum_types et
 WHERE eo.type_id = et.id AND et.type_key IN
   ('reward_penalty_kind','reward_penalty_detect','reward_penalty_source','reward_penalty_status');
DELETE FROM enum_types WHERE type_key IN
   ('reward_penalty_kind','reward_penalty_detect','reward_penalty_source','reward_penalty_status');
