import { dbPool } from "../../config/db.js";

const VALID_STATUSES = new Set(["pending", "approved", "rejected"]);

export async function getDeveloperStatus(userId) {
  const result = await dbPool.query(
    `SELECT status, message, reviewed_at, created_at, updated_at
       FROM developer_requests
      WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) {
    return { status: "none", message: null, reviewedAt: null };
  }
  return {
    status: row.status,
    message: row.message,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function requestDeveloper(userId, message = null) {
  const result = await dbPool.query(
    `INSERT INTO developer_requests (user_id, status, message, reviewed_by, reviewed_at, updated_at)
     VALUES ($1, 'pending', $2, NULL, NULL, now())
     ON CONFLICT (user_id) DO UPDATE
       SET status = 'pending',
           message = EXCLUDED.message,
           reviewed_by = NULL,
           reviewed_at = NULL,
           updated_at = now()
     RETURNING status, message, created_at, updated_at`,
    [userId, message]
  );
  return getDeveloperStatus(userId);
}

export async function listDeveloperRequests(status = null) {
  const params = [];
  let where = "";
  if (status && VALID_STATUSES.has(status)) {
    params.push(status);
    where = "WHERE dr.status = $1";
  }
  const result = await dbPool.query(
    `SELECT dr.id,
            dr.user_id,
            dr.status,
            dr.message,
            dr.reviewed_at,
            dr.created_at,
            u.name  AS user_name,
            u.email AS user_email,
            u.image AS user_image
       FROM developer_requests dr
       JOIN "user" u ON u.id = dr.user_id
       ${where}
      ORDER BY (dr.status = 'pending') DESC, dr.created_at DESC`,
    params
  );
  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    status: row.status,
    message: row.message,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    userName: row.user_name,
    userEmail: row.user_email,
    userImage: row.user_image,
  }));
}

export async function reviewDeveloperRequest(id, adminId, approve) {
  const status = approve ? "approved" : "rejected";
  const result = await dbPool.query(
    `UPDATE developer_requests
        SET status = $1,
            reviewed_by = $2,
            reviewed_at = now(),
            updated_at = now()
      WHERE id = $3
      RETURNING id, user_id, status, reviewed_at`,
    [status, adminId, id]
  );
  if (result.rowCount === 0) {
    const err = new Error("Developer request not found");
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }
  return result.rows[0];
}
