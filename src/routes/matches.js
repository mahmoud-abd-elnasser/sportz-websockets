import { Router } from "express";
import {createMatchSchema, listMatchesQuerySchema} from "../validation/matches.js";
import {db} from "../db/db.js";
import {getMatchStatus} from "../utils/match-status.js";
import {matches} from "../db/schema.js";
import {desc} from "drizzle-orm";

export const matchRouter = Router();

const MAX_LIMIT = 100;

matchRouter.get('/', async (req, res) => {
    const parsed = listMatchesQuerySchema.safeParse(req.query)
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid match data", errors: JSON.stringify(parsed.error) });
        return;
    }
    const limit = Math.min(parsed.data.limit ?? 50, MAX_LIMIT);
    try {
    const data = await db
        .select()
        .from(matches)
        .orderBy((desc(matches.createdAt)))
        .limit(limit);
    res.status(200).json({ message: "Matches retrieved successfully", data:data });
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Failed to retrieve matches" });
    }
});

matchRouter.post('/', async (req, res) => {
    const parsed = createMatchSchema.safeParse(req.body)
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid match data", errors: JSON.stringify(parsed.error) });
        return;
    }
    const { startTime, endTime, homeScore, awayScore } = parsed.data;
    try {
    const [event] = await db.insert(matches).values({
        ...parsed.data,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        homeScore:homeScore ?? 0,
        awayScore:awayScore ?? 0,
        status:getMatchStatus(startTime,endTime)
    }).returning()

    if (res.app.locals.broadcastMatchCreated) {
        res.app.locals.broadcastMatchCreated(event)
    }

        res.status(201).json({ message: "Match created successfully", data:event })
    } catch (e) {
        console.error(e);
        res.status(500).json({ message: "Internal server error" });
    }
});