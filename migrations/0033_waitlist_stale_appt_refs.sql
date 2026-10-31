UPDATE waitlist
   SET scheduled_appointment_id = NULL,
       updated_at = datetime('now')
 WHERE status != 'scheduled'
   AND scheduled_appointment_id IS NOT NULL;
