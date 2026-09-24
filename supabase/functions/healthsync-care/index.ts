import { withSupabase } from "npm:@supabase/server";

type CreatePayload = {
  action: "create";
  specialty_id?: string;
  urgency?: "routine" | "priority" | "urgent";
  description?: string;
  communication_preference?: string;
  city?: string;
  district?: string;
  state?: string;
  latitude?: number | null;
  longitude?: number | null;
};

type RespondPayload = {
  action: "respond";
  assignment_id?: string;
  decision?: "accept" | "decline";
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

Deno.serve(
  withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => null) as CreatePayload | RespondPayload | null;
    if (!body || !("action" in body)) return json({ error: "Invalid request" }, 400);

    const userId = ctx.userClaims?.sub;
    if (!userId) return json({ error: "Authentication required" }, 401);

    const { data: profile, error: profileError } = await ctx.supabase
      .from("profiles")
      .select("id, full_name, role, status")
      .eq("id", userId)
      .single();

    if (profileError || !profile) return json({ error: "Profile not found" }, 403);

    const admin = ctx.supabaseAdmin;

    if (body.action === "create") {
      if (profile.role !== "patient" || profile.status !== "active") {
        return json({ error: "Only active patient accounts can create care requests" }, 403);
      }

      const p = body as CreatePayload;
      const description = String(p.description || "").trim();
      if (!description || description.length < 8) {
        return json({ error: "Please provide a meaningful description of at least 8 characters" }, 400);
      }
      if (!p.specialty_id) return json({ error: "Specialty is required" }, 400);

      const { data: specialty, error: specialtyError } = await admin
        .from("specialties")
        .select("id, name")
        .eq("id", p.specialty_id)
        .eq("active", true)
        .single();

      if (specialtyError || !specialty) return json({ error: "Selected specialty is unavailable" }, 400);

      const lat = typeof p.latitude === "number" ? p.latitude : null;
      const lon = typeof p.longitude === "number" ? p.longitude : null;
      const location = lat !== null && lon !== null ? `POINT(${lon} ${lat})` : null;

      const insertPayload: Record<string, unknown> = {
        patient_id: userId,
        specialty_id: specialty.id,
        description,
        urgency: p.urgency || "routine",
        communication_preference: p.communication_preference || "secure_chat",
        city: String(p.city || "").trim() || null,
        district: String(p.district || "").trim() || null,
        state: String(p.state || "").trim() || null,
      };
      if (location) insertPayload.location = location;

      const { data: request, error: requestError } = await ctx.supabase
        .from("consultation_requests")
        .insert(insertPayload)
        .select("id, specialty_id, urgency, description, city, district, state, status, communication_preference, created_at")
        .single();

      if (requestError || !request) {
        return json({ error: requestError?.message || "Could not create request" }, 400);
      }

      const { data: consultants } = await admin
        .from("consultant_profiles")
        .select("user_id, specialty, service_radius_km, is_available, verification_status, profiles!inner(id, full_name, city, district, state, latitude, longitude, status)")
        .eq("specialty", specialty.name)
        .eq("is_available", true)
        .eq("verification_status", "active")
        .eq("profiles.status", "active")
        .limit(50);

      const ranked = (consultants || [])
        .map((c: any) => {
          const pr = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
          const distance = lat !== null && lon !== null && typeof pr?.latitude === "number" && typeof pr?.longitude === "number"
            ? distanceKm(lat, lon, pr.latitude, pr.longitude)
            : null;
          const radius = Number(c.service_radius_km || 25);
          return { ...c, profile: pr, distance, eligible: distance === null || distance <= radius };
        })
        .filter((c: any) => c.eligible)
        .sort((a: any, b: any) => (a.distance ?? 999999) - (b.distance ?? 999999))
        .slice(0, 3);

      if (ranked.length) {
        const assignments = ranked.map((c: any) => ({
          request_id: request.id,
          consultant_id: c.user_id,
          status: "pending",
        }));

        const { data: createdAssignments } = await admin
          .from("consultation_assignments")
          .upsert(assignments, { onConflict: "request_id,consultant_id" })
          .select("id, consultant_id");

        await admin.from("notifications").insert(ranked.map((c: any) => ({
          user_id: c.user_id,
          type: "consultation_request",
          title: "New care request",
          body: `${profile.full_name} has requested ${specialty.name} support.${request.urgency === "urgent" ? " Urgency: urgent." : ""}`,
          entity_id: request.id,
        })));

        await admin.from("audit_logs").insert({
          actor_id: userId,
          action: "consultation_request_created",
          entity_type: "consultation_request",
          entity_id: request.id,
          metadata: { specialty: specialty.name, matched_consultants: createdAssignments?.length || 0 },
        });
      } else {
        await admin.from("audit_logs").insert({
          actor_id: userId,
          action: "consultation_request_created_unmatched",
          entity_type: "consultation_request",
          entity_id: request.id,
          metadata: { specialty: specialty.name },
        });
      }

      return json({
        request,
        matched_consultants: ranked.length,
        message: ranked.length
          ? "Request created and routed to available consultants."
          : "Request created. No matching consultant is currently available.",
      }, 201);
    }

    if (body.action === "respond") {
      if (profile.role !== "consultant" || profile.status !== "active") {
        return json({ error: "Only active consultants can respond to assignments" }, 403);
      }

      const p = body as RespondPayload;
      if (!p.assignment_id || !["accept", "decline"].includes(p.decision || "")) {
        return json({ error: "Assignment and decision are required" }, 400);
      }

      const { data: assignment, error: assignmentError } = await admin
        .from("consultation_assignments")
        .select("id, request_id, consultant_id, status, consultation_requests!inner(id, patient_id, status, specialty_id, urgency)")
        .eq("id", p.assignment_id)
        .eq("consultant_id", userId)
        .single();

      if (assignmentError || !assignment) return json({ error: "Assignment not found" }, 404);
      if (assignment.status !== "pending") return json({ error: "This assignment has already been answered" }, 409);

      const request = Array.isArray((assignment as any).consultation_requests)
        ? (assignment as any).consultation_requests[0]
        : (assignment as any).consultation_requests;

      if (!request || request.status !== "pending") {
        return json({ error: "This care request is no longer available" }, 409);
      }

      const nextStatus = p.decision === "accept" ? "accepted" : "declined";

      await admin
        .from("consultation_assignments")
        .update({ status: nextStatus, responded_at: new Date().toISOString() })
        .eq("id", p.assignment_id)
        .eq("consultant_id", userId);

      if (nextStatus === "accepted") {
        await admin
          .from("consultation_requests")
          .update({ status: "accepted" })
          .eq("id", request.id)
          .eq("status", "pending");

        await admin
          .from("consultation_assignments")
          .update({ status: "declined", responded_at: new Date().toISOString() })
          .eq("request_id", request.id)
          .neq("id", p.assignment_id)
          .eq("status", "pending");

        await admin.from("notifications").insert({
          user_id: request.patient_id,
          type: "consultation_accepted",
          title: "Consultant accepted your request",
          body: `${profile.full_name} accepted your ${request.urgency} care request.`,
          entity_id: request.id,
        });
      } else {
        await admin.from("notifications").insert({
          user_id: request.patient_id,
          type: "consultation_declined",
          title: "Consultant unavailable",
          body: `${profile.full_name} is unavailable for this request. HealthSync can continue matching other available consultants.`,
          entity_id: request.id,
        });
      }

      await admin.from("audit_logs").insert({
        actor_id: userId,
        action: `consultation_assignment_${nextStatus}`,
        entity_type: "consultation_assignment",
        entity_id: p.assignment_id,
        metadata: { request_id: request.id },
      });

      return json({ ok: true, status: nextStatus, request_id: request.id });
    }

    return json({ error: "Unsupported action" }, 400);
  }),
);