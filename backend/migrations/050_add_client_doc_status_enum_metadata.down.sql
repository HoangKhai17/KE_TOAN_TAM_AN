DELETE FROM enum_options eo
USING enum_types et
WHERE eo.type_id = et.id
  AND et.type_key = 'notification_type'
  AND eo.option_key IN ('client_doc_submitted', 'client_doc_overdue');

DELETE FROM enum_types WHERE type_key = 'client_doc_status';
