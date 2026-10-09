import { db } from "./index.js";
import { now, upcomingWeekStart } from "../util/time.js";

/** Wipes and re-seeds the fictional Sharma-Rao household (see brain/CONTENT.md section 7). */
export function seed(): void {
  const week = upcomingWeekStart(now());
  const at = (dayOffset: number, hh: number, mm: number): string => {
    const d = new Date(week);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hh, mm, 0, 0);
    return d.toISOString();
  };

  const run = db.transaction(() => {
    for (const t of [
      "activity_log",
      "reminders",
      "event_members",
      "events",
      "grocery_items",
      "chores",
      "members",
    ]) {
      db.exec(`DELETE FROM ${t}`);
    }

    const addMember = db.prepare("INSERT INTO members (name, role, color, emoji) VALUES (?, ?, ?, ?)");
    const arjun = Number(addMember.run("Arjun", "parent", "#146EB4", "🧔").lastInsertRowid);
    const meera = Number(addMember.run("Meera", "parent", "#FF9900", "👩").lastInsertRowid);
    const riya = Number(addMember.run("Riya", "teen", "#067D62", "🧑‍🎓").lastInsertRowid);
    const kabir = Number(addMember.run("Kabir", "kid", "#9C27B0", "🧒").lastInsertRowid);

    // Deliberately uneven: Meera carries most of the effort so rebalancing has a visible effect.
    const addChore = db.prepare(
      "INSERT INTO chores (title, effort, frequency, assignee_id, due_date) VALUES (?, ?, 'weekly', ?, ?)",
    );
    const due = at(6, 20, 0); // Sunday evening
    addChore.run("Clean bathroom", 4, meera, due);
    addChore.run("Cook Sunday dinner", 4, meera, due);
    addChore.run("Vacuum living room", 3, meera, due);
    addChore.run("Laundry", 3, meera, due);
    addChore.run("Walk the dog", 2, arjun, due);
    addChore.run("Take out trash", 1, arjun, due);
    addChore.run("Dishes", 2, riya, due);
    addChore.run("Water plants", 1, kabir, due);

    const addItem = db.prepare(
      "INSERT INTO grocery_items (name, quantity, category, added_by) VALUES (?, ?, ?, ?)",
    );
    addItem.run("Rice", "5 kg", "pantry", meera);
    addItem.run("Bananas", "1 dozen", "produce", meera);
    addItem.run("Curd", "1", "dairy", arjun);
    addItem.run("Onions", "2 kg", "produce", meera);
    addItem.run("Notebook for Kabir", "1", "school", meera);

    const addEvent = db.prepare("INSERT INTO events (title, start_at, end_at, location) VALUES (?, ?, ?, ?)");
    const link = db.prepare("INSERT INTO event_members (event_id, member_id) VALUES (?, ?)");
    const ev = (title: string, s: string, e: string, loc: string, who: number[]) => {
      const id = Number(addEvent.run(title, s, e, loc).lastInsertRowid);
      who.forEach((m) => link.run(id, m));
    };
    ev("Kabir's drawing class", at(0, 19, 0), at(0, 20, 0), "Art studio", [kabir, meera]);
    ev("Parent-teacher meeting", at(2, 18, 30), at(2, 19, 15), "Riya's school", [arjun, meera]);
    ev("Football practice pickup", at(3, 17, 0), at(3, 17, 45), "Sports ground", [arjun, riya]);
    // Deliberate conflict with the pickup above (Arjun is double-booked on Thursday).
    ev("Dentist appointment", at(3, 17, 30), at(3, 18, 15), "Smile Dental Clinic", [arjun, kabir]);
    ev("Grandparents video call", at(5, 11, 0), at(5, 11, 45), "Home", [arjun, meera, riya, kabir]);
  });
  run();
}

// Run directly: `npm run seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  seed();
  console.log("Seeded the Sharma-Rao household.");
}
