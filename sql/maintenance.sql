WHENEVER SQLERROR EXIT SQL.SQLCODE
CREATE OR REPLACE TRIGGER gs_fault_quarantine
AFTER INSERT OR UPDATE OF repair_status ON maintenance_log
FOR EACH ROW
BEGIN
 IF :NEW.repair_status IN ('OPEN','IN_PROGRESS') THEN
  UPDATE charger_bay SET is_operational=0 WHERE bay_id=:NEW.bay_id;
 END IF;
END;
/
EXIT SUCCESS
