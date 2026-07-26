-- Gỡ enum metadata đã seed (enum_options xóa theo CASCADE khi xóa enum_types)
DELETE FROM enum_types WHERE type_key IN ('location_type', 'location_status', 'accounting_form');

DROP TABLE IF EXISTS company_locations;
