import pg from 'pg'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://wfpanel:wfpanel@localhost:5432/wfpanel_db',
  max: 10,
})

pool.on('error', (err) => {
  console.error('[pg] unexpected pool error', err.message)
})

export default pool
