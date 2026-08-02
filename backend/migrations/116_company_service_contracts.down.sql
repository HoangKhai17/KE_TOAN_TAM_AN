DROP TABLE IF EXISTS company_service_contracts;
DELETE FROM enum_options WHERE type_id = (SELECT id FROM enum_types WHERE type_key = 'contract_type');
DELETE FROM enum_types WHERE type_key = 'contract_type';
