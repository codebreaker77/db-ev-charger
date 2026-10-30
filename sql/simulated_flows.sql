WHENEVER SQLERROR EXIT SQL.SQLCODE
ALTER TABLE reservation_checkout ADD (idempotency_key VARCHAR2(64), expires_at TIMESTAMP, quote VARCHAR2(2000), payment_method VARCHAR2(30), authorized_at TIMESTAMP, failure_reason VARCHAR2(500));
ALTER TABLE charging_session ADD (tariff_snapshot VARCHAR2(2000), failure_reason VARCHAR2(500), cancellation_reason VARCHAR2(500), created_at TIMESTAMP DEFAULT SYSTIMESTAMP, updated_at TIMESTAMP DEFAULT SYSTIMESTAMP);
ALTER TABLE invoice ADD (snapshot VARCHAR2(4000), created_at TIMESTAMP DEFAULT SYSTIMESTAMP, paid_at TIMESTAMP);
ALTER TABLE payment ADD (is_test NUMBER(1) DEFAULT 1, idempotency_key VARCHAR2(64), failure_reason VARCHAR2(500), refunded_at TIMESTAMP);
CREATE UNIQUE INDEX gs_checkout_key ON reservation_checkout(idempotency_key);
EXIT SUCCESS
