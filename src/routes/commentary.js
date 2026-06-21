import { Router } from "express";
import { matchIdParamSchema } from "../validation/matches.js";
import { createCommentarySchema, listCommentaryQuerySchema } from "../validation/commentary.js";
import { db } from "../db/db.js";
import { commentary } from "../db/schema.js";
import { sql, desc } from "drizzle-orm";

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
            .where(sql`${commentary.matchId} = ${paramParsed.data.id}`)
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

    try {
        // Fetch the current max sequence for this match to auto-increment it if not provided
        let sequence = bodyParsed.data.sequence;
        if (sequence === undefined) {
            const lastCommentary = await db
                .select({ sequence: commentary.sequence })
                .from(commentary)
                .where(sql`${commentary.matchId} = ${paramParsed.data.id}`)
                .orderBy(desc(commentary.sequence))
                .limit(1);

            sequence = lastCommentary.length > 0 ? lastCommentary[0].sequence + 1 : 1;
        }

        const [newCommentary] = await db.insert(commentary).values({
            ...bodyParsed.data,
            matchId: paramParsed.data.id,
            sequence,
        }).returning();

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