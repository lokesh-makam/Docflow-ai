import { Router } from "express";
import { db } from "@docflow/database";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

/** GET /api/auth/me — current authenticated user */
authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        email: true,
        createdAt: true,
        _count: {
          select: {
            installations: true,
          },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ success: false, error: "User not found" });
    }

    res.json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch user" });
  }
});
