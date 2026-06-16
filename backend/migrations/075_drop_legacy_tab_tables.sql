-- Migration 075: drop bảng cũ của HĐLĐ / HĐ KH.NCC / Nợ NSNN sau khi đã migrate
-- sang Generic Company Tables (migration 074) + cutover code. Giữ Archive bespoke.
-- Dữ liệu KHÔNG mất: đã copy sang company_table_rows / company_table_company_columns.

DROP TABLE IF EXISTS company_labor_contracts;
DROP TABLE IF EXISTS company_csc_contracts;
DROP TABLE IF EXISTS company_csc_columns;
DROP TABLE IF EXISTS company_nsnn_debts;
DROP TABLE IF EXISTS company_nsnn_columns;
