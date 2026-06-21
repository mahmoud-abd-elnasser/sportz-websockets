import { Router } from "express";
import { matchIdParamSchema } from "../validation/matches.js";
import { createCommentarySchema, listCommentaryQuerySchema } from "../validation/commentary.js";
import { db } from "../db/db.js";
import { commentary } from "../db/schema.js";
import { desc, eq } from "drizzle-orm"; // 💡 Imported 'eq'

export const commentaryRoutes = Router({ mergeParams: true });

const MAX_LIMIT = 100;

commentaryRoutes.get('/', async (req, res) => {
    const paramParsed = matchIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
        return res.status(400).json({ message: "Invalid match ID", errors: paramParsed.error.format() });
    }

    const queryParsed = listCommentaryQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
        return res.status(400).json({ message: "Invalid query parameters", errors: queryParsed.error.format() });
    }

    try {
        const limit = Math.min(queryParsed.data.limit ?? 100, MAX_LIMIT);

        const results = await db
            .select()
            .from(commentary)
            .where(eq(commentary.matchId, paramParsed.data.id)) // 💡 Cleaner, type-safe condition
            .orderBy(desc(commentary.createdAt))
            .limit(limit);

        res.status(200).json(results);
    } catch (error) {
        console.error("Error fetching commentary:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

commentaryRoutes.post('/', async (req, res) => {
    const paramParsed = matchIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
        return res.status(400).json({ message: "Invalid match ID", errors: paramParsed.error.format() });
    }

    const bodyParsed = createCommentarySchema.safeParse(req.body);
    if (!bodyParsed.success) {
        return res.status(400).json({ message: "Invalid commentary data", errors: bodyParsed.error.format() });
    }

    // 💡 Declare variable outside the loop scope so it's accessible later
    let newCommentary = null;
    let sequence = bodyParsed.data.sequence;
    const maxRetries = 3;

    try {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                if (sequence === undefined) {
                    const lastCommentary = await db
                        .select({ sequence: commentary.sequence })
                        .from(commentary)
                        .where(eq(commentary.matchId, paramParsed.data.id)) // 💡 Changed to eq()
                        .orderBy(desc(commentary.sequence))
                        .limit(1);

                    sequence = lastCommentary.length > 0 ? lastCommentary[0].sequence + 1 : 1;
                }

                // Assigned directly to our outer variable instead of a block-scoped const
                const [inserted] = await db.insert(commentary).values({
                    ...bodyParsed.data,
                    matchId: paramParsed.data.id,
                    sequence,
                }).returning();

                newCommentary = inserted;
                break;
            } catch (err) {
                // Handle Postgres unique constraint violation error code '23505'
                if (err.code === '23505' && attempt < maxRetries - 1) {
                    sequence = undefined; // recalculate fresh sequence value on retry
                    continue;
                }
                throw err;
            }
        }

        // Double check we actually successfully created a record before proceeding
        if (!newCommentary) {
            return res.status(500).json({ message: "Failed to generate sequence after multiple attempts" });
        }

        // Now safe from ReferenceErrors!
        if (res.app.locals.broadcastCommentary) {
            res.app.locals.broadcastCommentary(newCommentary.matchId, newCommentary);
        }

        res.status(201).json({
            message: "Commentary created successfully",
            data: newCommentary
        });
    } catch (error) {
        console.error("Error creating commentary:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});