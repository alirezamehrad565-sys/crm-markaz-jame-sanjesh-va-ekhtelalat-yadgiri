UPDATE waitlist
   SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
       updated_at = datetime('now')
 WHERE status = 'admitted'
   AND deleted_at IS NULL;
