// backend/controllers/coach.controller.js
const db = require('../database.js');

// Controller function to get coach config
const getCoachConfig = async (req, res) => {
  // TODO: Implement authentication/authorization - Ensure only the coach can access this.

  try {
    const sql = "SELECT coachId, weeklyTemplate, sessionDurationMinutes FROM CoachConfig LIMIT 1";
    db.get(sql, [], (err, row) => {
      if (err) {
        console.error("Database error getting coach config:", err.message);
        return res.status(500).json({ error: 'Database error fetching configuration.' });
      }

      if (!row) {
        return res.status(404).json({ error: 'Coach configuration not found.' });
      }

      let configData = { ...row };
      try {
        if (configData.weeklyTemplate) {
            configData.weeklyTemplate = JSON.parse(configData.weeklyTemplate);
        } else {
            configData.weeklyTemplate = null;
        }
      } catch (parseError) {
        console.error("Error parsing weeklyTemplate JSON:", parseError.message);
        return res.status(500).json({ error: 'Error processing configuration data.' });
      }
      res.status(200).json(configData);
    });
  } catch (error) {
    console.error("Error in getCoachConfig controller:", error.message);
    res.status(500).json({ error: 'Failed to retrieve coach configuration.' });
  }
};

// Controller function to update coach config
const updateCoachConfig = async (req, res) => {
  // TODO: Implement authentication/authorization - Ensure only the coach can access this.

  try {
    const { coachId, weeklyTemplate, sessionDurationMinutes } = req.body;

    if (!coachId || !weeklyTemplate || sessionDurationMinutes === undefined) {
      return res.status(400).json({ error: 'Missing required configuration fields (coachId, weeklyTemplate, sessionDurationMinutes).' });
    }
    if (typeof sessionDurationMinutes !== 'number' || sessionDurationMinutes <= 0) {
      return res.status(400).json({ error: 'sessionDurationMinutes must be a positive number.' });
    }
    if (typeof weeklyTemplate !== 'object' || weeklyTemplate === null) {
        return res.status(400).json({ error: 'weeklyTemplate must be a valid object.' });
    }

    let weeklyTemplateString;
    try {
      weeklyTemplateString = JSON.stringify(weeklyTemplate);
    } catch (stringifyError) {
      console.error("Error stringifying weeklyTemplate:", stringifyError.message);
      return res.status(400).json({ error: 'Invalid weeklyTemplate JSON format.' });
    }

    const sql = `
      INSERT OR REPLACE INTO CoachConfig
        (coachId, weeklyTemplate, sessionDurationMinutes)
      VALUES (?, ?, ?)
    `;

    db.run(sql, [coachId, weeklyTemplateString, sessionDurationMinutes], function(err) {
      if (err) {
        console.error("Database error upserting coach config:", err.message);
        return res.status(500).json({ error: 'Database error saving configuration.' });
      }

      console.log(`Coach config saved/updated for coachId: ${coachId}. Rows affected: ${this.changes}`);

      // TODO: Implement logic here to delete/regenerate AvailabilitySlots.
      console.log("Placeholder: Trigger slot regeneration logic here.");

      res.status(200).json({ message: 'Configuration saved successfully.' });
    });

  } catch (error) {
    console.error("Error in updateCoachConfig controller:", error.message);
    res.status(500).json({ error: 'Failed to save coach configuration.' });
  }
};

module.exports = {
  getCoachConfig,
  updateCoachConfig,
};