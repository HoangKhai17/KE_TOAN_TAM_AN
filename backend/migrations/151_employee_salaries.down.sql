DELETE FROM enum_options WHERE type_id = (SELECT id FROM enum_types WHERE type_key = 'salary_change_type');
DELETE FROM enum_types WHERE type_key = 'salary_change_type';
DROP TABLE IF EXISTS employee_salaries;
