"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { generateAIInsights } from "@/actions/dashboard";

export async function updateUser(data) {
    try {
        const { userId } = await auth();
        if (!userId) {
            throw new Error("Unauthorized");
        }

        const user = await db.user.findUnique({
            where: {
                clerkUserId: userId,
            },
        });

        if (!user) {
            throw new Error("User not found");
        }

        // Validate required data
        if (!data.industry) {
            throw new Error("Industry is required");
        }

        const result = await db.$transaction(async (tx) => {
            // First check if industry insight exists
            let industryInsight = await tx.industryInsight.findUnique({
                where: {
                    industry: data.industry,
                },
            });

            // Create industry insight if it doesn't exist
            if (!industryInsight) {
                const insights = await generateAIInsights(data.industry);
                
                industryInsight = await tx.industryInsight.create({
                    data: {
                        industry: data.industry,
                        salaryRanges: insights.salaryRanges,
                        growthRate: insights.growthRate,
                        demandLevel: insights.demandLevel, // Mapped correctly
                        topSkills: insights.topSkills,
                        marketOutlook: insights.marketOutlook, // Mapped correctly
                        keyTrends: insights.keyTrends,
                        recommendedSkills: insights.recommendedSkills,
                        nextUpdate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    },
                });
            }

            // Update user with validated data
            const updatedUser = await tx.user.update({
                where: {
                    id: user.id,
                },
                data: {
                    industry: data.industry, // This connects to IndustryInsight via the foreign key
                    experience: data.experience || null,
                    bio: data.bio || null,
                    skills: Array.isArray(data.skills) ? data.skills : [],
                },
                include: {
                    industryInsight: true, // Include the related industry insight in the response
                },
            });

            return { updatedUser, industryInsight };
        }, {
            timeout: 10000,
            isolationLevel: 'ReadCommitted',
        });

        return { success: true, ...result };
    } catch (error) {
        console.error("Detailed error in updateUser:", error);
        
        if (error.code === 'P2002') {
            throw new Error("Unique constraint violation");
        }
        if (error.code === 'P2025') {
            throw new Error("Record not found");
        }
        
        throw new Error(`Failed to update profile: ${error.message}`);
    }
}

export async function getUserOnboardingStatus() {
    try {
        const { userId } = await auth();
        if (!userId) {
            throw new Error("Unauthorized");
        }

        const user = await db.user.findUnique({
            where: {
                clerkUserId: userId,
            },
            select: {
                industry: true,
                experience: true,
                bio: true,
                skills: true,
                industryInsight: true,
            },
        });

        return {
            isOnboarded: Boolean(user?.industry),
            user: user || null,
        };
    } catch (error) {
        console.error("Error in getUserOnboardingStatus:", error);
        throw new Error(`Failed to check onboarding status: ${error.message}`);
    }
}
