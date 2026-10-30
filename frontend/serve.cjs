// Development convenience: serve frontend and authenticated API on ONE origin.
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { createApp } = require('../server/app');
createApp().listen(process.env.FRONTEND_PORT || 5173, () => console.log(`GridSync: http://localhost:${process.env.FRONTEND_PORT || 5173}`));
