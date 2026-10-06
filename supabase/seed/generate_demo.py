#!/usr/bin/env python3
"""
Generates supabase/seed/demo.sql — demo data for a choral composition contest,
in Catalan, on the "Conservatorio Demo" organisation.

    python3 supabase/seed/generate_demo.py > supabase/seed/demo.sql

Deterministic: every id is a uuid5 of a readable key, so regenerating and
re-running the SQL always lands on the same state. All participant contact
data is fictitious; emails use example.com (reserved, never delivered).
"""

import json
import math
import sys
import uuid
from datetime import date, datetime, timedelta

NS = uuid.UUID("5e3d1a1e-0000-4000-8000-00000000c0aa")
ORG = "bbbbbbbb-0000-0000-0000-000000000001"

USERS = {
    "org": "aaaaaaaa-0000-0000-0000-000000000001",
    "participante": "aaaaaaaa-0000-0000-0000-000000000002",
    "jurado": "aaaaaaaa-0000-0000-0000-000000000003",
    "juez1": "bbbbbbbb-0000-0000-0000-000000000001",
    "juez2": "bbbbbbbb-0000-0000-0000-000000000002",
    "juez3": "bbbbbbbb-0000-0000-0000-000000000003",
    "juez4": "bbbbbbbb-0000-0000-0000-000000000004",
}
PROFILE_NAMES = {
    "org": "Fundació Coral Demo",
    "participante": "Laia Serra",
    "jurado": "Jordi Casals",
    "juez1": "Montserrat Vila",
    "juez2": "Albert Soler",
    "juez3": "Núria Ferrer",
    "juez4": "Pau Rovira",
}
JUDGES = ["jurado", "juez1", "juez2", "juez3", "juez4"]


def uid(key: str) -> str:
    return str(uuid.uuid5(NS, key))


def q(v):
    """SQL literal."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


TABLES = []   # (table, rows) in insertion order, for --json


def insert(table, rows):
    if not rows:
        return ""
    TABLES.append((table, rows))
    cols = list(rows[0].keys())
    values = ",\n  ".join("(" + ", ".join(q(r[c]) for c in cols) + ")" for r in rows)
    quoted = ", ".join(f'"{c}"' if c == "order" else c for c in cols)
    return f"insert into {table} ({quoted}) values\n  {values};\n\n"


def dni(n: int) -> str:
    num = 40_000_000 + n * 7919
    return f"{num}{'TRWAGMYFPDXBNJZSQVHLCKE'[num % 23]}"


# ─── People (fictitious) ────────────────────────────────────────────────────

COMPOSERS_2026 = {
    "A": [
        ("Laia", "Serra Puig", "ES", "participante"),
        ("Marc", "Ribas Coll", "ES", None),
        ("Clàudia", "Bosch Martí", "ES", None),
        ("Oriol", "Pujol Sala", "ES", None),
        ("Élodie", "Marchand", "FR", None),
        ("Giulia", "Bernardi", "IT", None),
        ("Arnau", "Vidal Roca", "ES", None),
        ("Sofía", "Herrera Gil", "AR", None),
        ("Joan", "Mas Ferrer", "ES", None),
        ("Lukas", "Weber", "DE", None),
        ("Mireia", "Costa Blanch", "ES", None),
    ],
    "B": [
        ("Anna", "Font Camps", "ES", None),
        ("Pere", "Gras Valls", "ES", None),
        ("Inés", "Navarro Ruiz", "ES", None),
        ("Tomàs", "Solé Prat", "ES", None),
        ("Camille", "Lefèvre", "FR", None),
        ("Berta", "Riera Duran", "ES", None),
        ("Diego", "Salinas Mora", "MX", None),
        ("Queralt", "Torrent Vives", "ES", None),
    ],
    "C": [
        ("Martina", "Comas Rius", "ES", None),
        ("Xavier", "Planas Bou", "ES", None),
        ("Helena", "Rovira Soler", "ES", None),
        ("Biel", "Ferrà Mir", "ES", None),
        ("Lucía", "Ortega Paz", "ES", None),
        ("Jana", "Escudé Bonet", "ES", None),
        ("Nil", "Sabaté Grau", "ES", None),
        ("Paula", "Marín Soto", "ES", None),
    ],
}

WORKS_2026 = {
    "A": ["Cançó de bressol per a la nit llarga", "El cant dels ocells (nova lectura)", "Mar endins", "Les veus de la pedra",
          "Aube sur la Garonne", "Notturno di Montserrat", "Terra de ningú", "Oración del viento", "Cel de juny",
          "Stille Gärten", "Llum de gener"],
    "B": ["Ave maris stella", "Les hores blanques", "Agua de mayo", "Pregària del vespre", "Chant des marées",
          "Salve de l'Empordà", "Canto de las cigarras", "Rosa de vents"],
    "C": ["El drac de Sant Jordi", "Cançó de la pluja", "Els estels que ballen", "La lluna i el gat",
          "Jugant al pati", "Ninetes de paper", "Vent de tramuntana", "Somnis de colors"],
}
TEXTS = ["Joan Maragall", "Salvador Espriu", "Maria-Mercè Marçal", "Miquel Martí i Pol", "text litúrgic",
         "Rosa Leveroni", "Vicent Andrés Estellés", "Gabriela Mistral", "Josep Carner", "Montserrat Abelló"]

COMPOSERS_2025 = [
    ("Ferran", "Llobet Sans"), ("Maria", "Codina Pou"), ("Àlex", "Garriga Fuster"),
    ("Neus", "Vallès Serra"), ("Hugo", "Martín Lara"), ("Emma", "Duran Coll"),
]

CATEGORIES = [
    ("A", "Cor mixt (SATB)", "Obres per a cor mixt a quatre veus o més, a cappella o amb piano."),
    ("B", "Veus iguals", "Obres per a cor de veus blanques o de veus greus."),
    ("C", "Cor infantil i juvenil", "Obres pensades per a cors d'infants i joves, de dificultat mitjana."),
]

# ─── Contest texts ──────────────────────────────────────────────────────────

RULES = """## Bases del concurs

**1. Objecte.** El concurs vol estimular la creació de repertori coral nou. S'hi poden presentar obres inèdites, no estrenades ni premiades.

**2. Categories.** A · Cor mixt (SATB). B · Veus iguals. C · Cor infantil i juvenil.

**3. Inscripció.** Fins al 31 de juliol de 2026, amb el formulari en línia. Cal adjuntar la partitura en PDF (amb pseudònim, sense el nom de l'autor) i, opcionalment, un àudio de referència. Quota: 40 €.

**4. Fases.**
- *Selecció de partitures:* el jurat llegeix les obres i decideix quines passen (passa / no passa).
- *Semifinal:* lectura de les obres seleccionades amb el cor de l'organització, amb puntuació de 0 a 10.
- *Final:* concert públic al Palau, amb puntuació de 0 a 10.

**5. Premis.** 1.500 € per categoria i estrena a la temporada següent.

**6. Jurat.** Format per compositors i directors de cor de reconegut prestigi. Les seves decisions són inapel·lables."""

DESCRIPTION = "Concurs internacional per a obres corals inèdites en tres categories. La final és un concert públic on el cor de l'organització estrena les obres finalistes."

# ─── Build ──────────────────────────────────────────────────────────────────

out = []
out.append("""-- ============================================================================
--  Dades de demo — Concurs Internacional de Composició Coral (Conservatorio Demo)
-- ============================================================================
--  GENERAT per supabase/seed/generate_demo.py. No l'editis a mà.
--
--  NO és una migració: es llança a mà per deixar la demo en un estat conegut.
--  1. ESBORRA tots els concursos de l'organització "Conservatorio Demo"
--     (irreversible; còpia a supabase/seed/backup-conservatorio-demo-*.json)
--     i el seu catàleg d'obres. No toca cap altra organització.
--  2. Sembra 3 concursos: el principal en plena celebració, l'edició 2025
--     finalitzada amb rànquing publicat i el premi 2027 en esborrany.
--  3. Esborra les notificacions dins l'app de les comptes demo, perquè la
--     demo comenci neta.
--  Idempotent: UUID fixos.
-- ============================================================================

begin;

do $$
declare faltan text;
begin
  select string_agg(e, ', ') into faltan from (values
    ('org@contestsaas.demo'), ('participante@contestsaas.demo'), ('jurado@contestsaas.demo'),
    ('juez1@contestsaas.demo'), ('juez2@contestsaas.demo'), ('juez3@contestsaas.demo'), ('juez4@contestsaas.demo')
  ) v(e) where not exists (select 1 from auth.users u where u.email = v.e);
  if faltan is not null then raise exception 'Falten comptes demo: %', faltan; end if;
  if not exists (select 1 from organizations where id = 'bbbbbbbb-0000-0000-0000-000000000001') then
    raise exception 'No existeix l''organització demo';
  end if;
end $$;

-- 1. Neteja
delete from contests where organization_id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from works where organization_id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from composers where organization_id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- 2. Organització i perfils
update organizations set name = 'Fundació Coral Demo', locale = 'ca', notification_email = null
where id = 'bbbbbbbb-0000-0000-0000-000000000001';
""")
for key, name in PROFILE_NAMES.items():
    out.append(f"update profiles set full_name = {q(name)} where id = {q(USERS[key])};\n")
out.append("\n")

C1, C2, C3 = uid("contest:2026"), uid("contest:2025"), uid("contest:2027")
out.append("-- 3. Concursos\n")
out.append(insert("contests", [
    dict(id=C1, organization_id=ORG, name="Concurs Internacional de Composició Coral 2026", slug="composicio-coral-2026",
         description=DESCRIPTION, rules=RULES, type="music", status="active", is_rounds_dynamic=False,
         starts_at="2026-09-15T09:00:00+02", ends_at="2026-11-14T21:00:00+01", registration_open=False,
         registration_token=uid("token:2026").replace("-", ""), entry_fee_cents=4000,
         performance_default_minutes=8, rehearsal_default_minutes=20, call_offset_minutes=60,
         voting_system="numeric", created_at="2026-05-04T10:00:00+02"),
    dict(id=C2, organization_id=ORG, name="Concurs de Composició Coral 2025", slug="composicio-coral-2025",
         description="Edició anterior. Rànquing publicat.", rules=RULES, type="music", status="finished",
         is_rounds_dynamic=False, starts_at="2025-10-01T09:00:00+02", ends_at="2025-11-15T21:00:00+01",
         registration_open=False, registration_token=uid("token:2025").replace("-", ""), entry_fee_cents=3500,
         performance_default_minutes=8, rehearsal_default_minutes=20, call_offset_minutes=60,
         voting_system="numeric", created_at="2025-04-10T10:00:00+02"),
    dict(id=C3, organization_id=ORG, name="Premi de Composició per a Cor Infantil 2027", slug="premi-cor-infantil-2027",
         description="Nova convocatòria en preparació.", rules=None, type="music", status="draft",
         is_rounds_dynamic=False, starts_at="2027-03-01T09:00:00+01", ends_at="2027-05-30T21:00:00+02",
         registration_open=False, registration_token=uid("token:2027").replace("-", ""), entry_fee_cents=2500,
         performance_default_minutes=6, rehearsal_default_minutes=15, call_offset_minutes=45,
         voting_system="binary", created_at="2026-10-01T10:00:00+02"),
]))

# Jury of the 2026 and 2025 contests (accepted below: the insert trigger
# leaves judges pending).
members = []
for contest_key, cid in (("2026", C1), ("2025", C2)):
    for j in JUDGES:
        members.append(dict(id=uid(f"member:{contest_key}:{j}"), contest_id=cid, user_id=USERS[j], role="judge",
                            email=f"{j}@contestsaas.demo", full_name=PROFILE_NAMES[j]))
out.append("-- 4. Jurat\n")
out.append(insert("contest_members", members))
out.append(f"""update contest_members set invitation_status = 'accepted', responded_at = '2026-09-01T12:00:00+02',
  invitation_token = null, invitation_expires_at = null
where contest_id in ({q(C1)}, {q(C2)});\n\n""")

# ─── Inscription form (published for 2026, draft for 2027) ───────────────────

def core_fields():
    return [
        dict(id="core.first_name", type="text", label="Nom", order=0, hidden=False, isCore=True, required=True, validation=dict(required=True)),
        dict(id="core.last_name", type="text", label="Cognoms", order=1, hidden=False, isCore=True, required=True, validation=dict(required=True)),
        dict(id="core.birthdate", type="date", label="Data de naixement", order=2, hidden=False, isCore=True, required=True, validation=dict(required=True)),
        dict(id="core.dni", type="text", label="DNI / NIE / Passaport", order=3, hidden=False, isCore=True, required=True, validation=dict(required=True, customRule="dni")),
        dict(id="core.country", type="text", label="País", order=4, hidden=False, isCore=True, required=True, validation=dict(required=True)),
        dict(id="core.phone", type="phone", label="Telèfon", order=5, hidden=False, isCore=True, required=False, validation=dict(required=False)),
        dict(id="core.email", type="email", label="Correu electrònic", order=6, hidden=False, isCore=True, required=True, validation=dict(required=True),
             description="Hi enviarem la confirmació de la inscripció."),
    ]

custom_fields = [
    dict(id="obra_titol", type="text", label="Títol de l'obra", order=7, hidden=False, required=True, validation=dict(required=True)),
    dict(id="obra_pseudonim", type="text", label="Pseudònim", order=8, hidden=False, required=True, validation=dict(required=True),
         description="La partitura s'avalua amb pseudònim: el jurat no veu el teu nom."),
    dict(id="obra_text", type="text", label="Autor del text", order=9, hidden=False, required=True, validation=dict(required=True),
         placeholder="Ex.: Joan Maragall, text litúrgic…"),
    dict(id="obra_durada", type="number", label="Durada aproximada (minuts)", order=10, hidden=False, required=True,
         validation=dict(required=True, minValue=2, maxValue=12)),
    dict(id="obra_acompanyament", type="radio", label="Acompanyament", order=11, hidden=False, required=True, validation=dict(required=True),
         options=[dict(value="a_cappella", label="A cappella"), dict(value="piano", label="Amb piano"), dict(value="altres", label="Altres instruments")]),
    dict(id="obra_partitura", type="file", label="Partitura (PDF, amb pseudònim)", order=12, hidden=False, required=True,
         accept=".pdf", maxFiles=1, maxSizeMB=20, validation=dict(required=True)),
    dict(id="obra_audio", type="file", label="Àudio de referència (opcional)", order=13, hidden=False, required=False,
         accept="audio/*", maxFiles=1, maxSizeMB=20, validation=dict(required=False)),
    dict(id="obra_inedita", type="checkbox", label="Obra inèdita", order=14, hidden=False, required=True, validation=dict(required=True),
         description="Declaro que l'obra és inèdita i que no ha estat estrenada ni premiada."),
    dict(id="accepto_bases", type="checkbox", label="Accepto les bases", order=15, hidden=False, required=True, validation=dict(required=True)),
]

FORM_2026 = uid("form:2026")
out.append("-- 5. Formulari d'inscripció\n")
out.append(insert("inscription_form_schemas", [
    dict(id=FORM_2026, contest_id=C1, version=1, is_published=True, schema_json=core_fields() + custom_fields,
         published_at="2026-05-10T10:00:00+02", created_at="2026-05-10T09:30:00+02"),
    dict(id=uid("form:2027"), contest_id=C3, version=1, is_published=False, schema_json=core_fields() + custom_fields[:4],
         published_at=None, created_at="2026-10-01T10:30:00+02"),
]))

# ─── 2026: categories, rounds, participants ─────────────────────────────────

ROUND_NAMES = [("sel", "Selecció de partitures", "vote", 1), ("semi", "Semifinal · Lectura amb cor", "numeric", 10), ("final", "Final · Concert", "numeric", 10)]

# Per category: (selection status, semifinal status, semifinal session, final session)
PLAN = {
    "A": ("closed", "active", (date(2026, 10, 17), "10:00", "13:00"), (date(2026, 11, 14), "18:00", "21:00")),
    "B": ("closed", "pending", (date(2026, 10, 18), "10:00", "12:30"), (date(2026, 11, 14), "18:00", "21:00")),
    "C": ("active", "pending", (date(2026, 10, 24), "11:00", "13:00"), (date(2026, 11, 14), "18:00", "21:00")),
}
QUALIFIED = {"A": 6, "B": 5}

categories, rounds, participants, responses = [], [], [], []
composers, works, rps, rpworks, scores = [], [], [], [], []

def score_val(seed: int, lo: float, hi: float) -> float:
    x = (seed * 2654435761) % 1000 / 1000
    return round((lo + (hi - lo) * x) * 2) / 2   # half points

pcounter = 0
for order, (ck, cname, cdesc) in enumerate(CATEGORIES, start=1):
    cat_id = uid(f"cat:2026:{ck}")
    categories.append(dict(id=cat_id, contest_id=C1, name=cname, description=cdesc, order=order, status="active", max_participants=40))
    sel_status, semi_status, semi_session, final_session = PLAN[ck]
    rid = {rk: uid(f"round:2026:{ck}:{rk}") for rk, *_ in ROUND_NAMES}
    for ro, (rk, rname, stype, maxs) in enumerate(ROUND_NAMES, start=1):
        status = {"sel": sel_status, "semi": semi_status, "final": "pending"}[rk]
        session = {"sel": None, "semi": semi_session, "final": final_session}[rk]
        rounds.append(dict(
            id=rid[rk], category_id=cat_id, name=rname, order=ro, status=status, scoring_type=stype, max_score=maxs,
            is_final=(rk == "final"), is_ranking=False, is_published=False,
            next_round_id=rid["semi"] if rk == "sel" else (rid["final"] if rk == "semi" else None),
            started_at="2026-09-20T10:00:00+02" if status in ("active", "closed") else None,
            closed_at="2026-10-05T19:00:00+02" if status == "closed" else None,
            session_date=session[0].isoformat() if session else None,
            session_start=session[1] if session else None, session_end=session[2] if session else None,
        ))

    people = COMPOSERS_2026[ck]
    pending_pay = {"C": {6, 7}}.get(ck, set())   # two late registrations still unpaid
    cat_pids = []
    for i, (first, last, country, user_key) in enumerate(people):
        pcounter += 1
        pid = uid(f"participant:2026:{ck}:{i}")
        email = f"{first.lower()}.{last.split()[0].lower()}@example.com".replace("à", "a").replace("è", "e").replace("é", "e").replace("í", "i").replace("ò", "o").replace("ó", "o").replace("ú", "u").replace("ï", "i").replace("ç", "c").replace("ñ", "n")
        if user_key == "participante":
            email = "participante@contestsaas.demo"
        paid = i not in pending_pay
        participants.append(dict(
            id=pid, contest_id=C1, category_id=cat_id, user_id=USERS[user_key] if user_key else None,
            name=f"{first} {last}", first_name=first, last_name=last, dni=dni(pcounter) if country == "ES" else None,
            birthdate=(date(1975, 1, 1) + timedelta(days=(pcounter * 997) % 9000)).isoformat(), country=country,
            email=email, phone=f"+34 6{(pcounter * 1234567) % 100000000:08d}" if country == "ES" else None,
            status="active", payment_status="paid" if paid else "pending", amount_paid_cents=4000 if paid else 0,
            created_at=(datetime(2026, 5, 12, 10) + timedelta(hours=pcounter * 37)).isoformat() + "+02",
        ))
        title = WORKS_2026[ck][i]
        duration = 240 + ((pcounter * 53) % 240)
        responses.append(dict(id=uid(f"resp:{pid}"), participant_id=pid, form_schema_id=FORM_2026, responses_json={
            "obra_titol": title, "obra_pseudonim": f"{['Albada','Tramuntana','Garbí','Xaloc','Llevant','Mestral','Migjorn','Ponent'][pcounter % 8]} {pcounter}",
            "obra_text": TEXTS[pcounter % len(TEXTS)], "obra_durada": math.ceil(duration / 60),
            "obra_acompanyament": ["a_cappella", "piano", "a_cappella", "altres"][pcounter % 4],
            "obra_inedita": True, "accepto_bases": True,
        }))
        comp_id = uid(f"composer:{first} {last}")
        composers.append(dict(id=comp_id, organization_id=ORG, name=f"{first} {last}"))
        work_id = uid(f"work:2026:{ck}:{i}")
        works.append(dict(id=work_id, organization_id=ORG, composer_id=comp_id, title=title, duration_seconds=duration))
        if paid:
            cat_pids.append((pid, work_id, duration))

    # Selection round: every paid participant, draw order = registration order.
    qualified = []
    for n, (pid, work_id, duration) in enumerate(cat_pids, start=1):
        rp_id = uid(f"rp:2026:{ck}:sel:{pid}")
        is_q = sel_status == "closed" and n <= QUALIFIED.get(ck, 0)
        rps.append(dict(id=rp_id, round_id=rid["sel"], participant_id=pid, order=n, draw_number=n, is_qualified=is_q,
                        performance_minutes=None, performance_time=None, performance_end_time=None,
                        rehearsal_time=None, rehearsal_room=None, rehearsal_accompanist=None))
        if is_q:
            qualified.append((pid, work_id, duration))
        # Binary votes. Closed: everyone voted, qualified got mostly "passa".
        # Active (C): only the first three have been read so far.
        voters = JUDGES if sel_status == "closed" else (JUDGES if n <= 3 else [])
        for j_i, j in enumerate(voters):
            if sel_status == "closed":
                passes = 1 if (n <= QUALIFIED[ck] and (n + j_i) % 5 != 0) or (n > QUALIFIED[ck] and (n + j_i) % 4 == 0) else 0
            else:
                passes = 1 if (n + j_i) % 3 != 0 else 0
            scores.append(dict(id=uid(f"score:{rp_id}:{j}"), round_id=rid["sel"], participant_id=pid, judge_id=USERS[j],
                               value=passes, notes=None, submitted_at="2026-10-03T18:00:00+02"))
        if sel_status == "closed":
            # The rest were eliminated at this stage.
            pass

    # Semifinal: qualified ones, draw renumbered, scheduled, repertoire = their work.
    if qualified:
        day, start, _end = semi_session
        clock = datetime.combine(day, datetime.strptime(start, "%H:%M").time())
        rehearsal = clock - timedelta(hours=1, minutes=30)
        semi_notes = [
            "Escriptura molt idiomàtica per al cor. El clímax final convenç.",
            "Bona idea harmònica, però la part de contralt queda massa greu.",
            "Text ben prosodiat. Potser li sobra una repetició a la secció central.",
            "Obra madura i personal. Molt bona resposta del cor.",
        ]
        for n, (pid, work_id, duration) in enumerate(qualified, start=1):
            rp_id = uid(f"rp:2026:{ck}:semi:{pid}")
            minutes = math.ceil(duration / 60) + 2   # reading + applause/changeover
            end = clock + timedelta(minutes=minutes)
            rps.append(dict(id=rp_id, round_id=rid["semi"], participant_id=pid, order=n, draw_number=n, is_qualified=False,
                            performance_minutes=minutes,
                            performance_time=clock.strftime("%Y-%m-%dT%H:%M"), performance_end_time=end.strftime("%Y-%m-%dT%H:%M"),
                            rehearsal_time=rehearsal.strftime("%Y-%m-%dT%H:%M"),
                            rehearsal_room="Sala d'assaig 1" if n % 2 else "Sala d'assaig 2",
                            rehearsal_accompanist="Cor de la Fundació · dir. Jordi Casals" if ck != "C" else "Cor infantil de la Fundació"))
            rpworks.append(dict(id=uid(f"rpw:{rp_id}"), round_participant_id=rp_id, work_id=work_id, position=1, duration_seconds=duration))
            clock = end
            rehearsal += timedelta(minutes=15)
            # A's semifinal is under way: the first four scored by everyone,
            # the fifth by three judges, the last not yet heard.
            if semi_status == "active":
                voters = JUDGES if n <= 4 else (JUDGES[:3] if n == 5 else [])
                for j_i, j in enumerate(voters):
                    scores.append(dict(id=uid(f"score:{rp_id}:{j}"), round_id=rid["semi"], participant_id=pid, judge_id=USERS[j],
                                       value=score_val(n * 10 + j_i, 6.0, 9.5),
                                       notes=semi_notes[(n + j_i) % 4] if j_i < 2 else None,
                                       submitted_at="2026-10-17T11:30:00+02"))

# Eliminated at selection: status 'eliminated' on the participant.
eliminated = set()
for ck in ("A", "B"):
    for rp in rps:
        if rp["round_id"] == uid(f"round:2026:{ck}:sel") and not rp["is_qualified"]:
            eliminated.add(rp["participant_id"])
for p in participants:
    if p["id"] in eliminated:
        p["status"] = "eliminated"

# ─── 2025: finished, one category, published final ──────────────────────────

cat25 = uid("cat:2025")
final25 = uid("round:2025:final")
categories.append(dict(id=cat25, contest_id=C2, name="Categoria única", description="Obres per a cor mixt.", order=1, status="closed", max_participants=40))
rounds.append(dict(id=final25, category_id=cat25, name="Final · Concert", order=1, status="closed", scoring_type="numeric", max_score=10,
                   is_final=True, is_ranking=False, is_published=True, next_round_id=None,
                   started_at="2025-11-15T18:00:00+01", closed_at="2025-11-15T21:30:00+01",
                   session_date="2025-11-15", session_start="18:00", session_end="21:00"))
for i, (first, last) in enumerate(COMPOSERS_2025):
    pcounter += 1
    pid = uid(f"participant:2025:{i}")
    participants.append(dict(
        id=pid, contest_id=C2, category_id=cat25, user_id=None, name=f"{first} {last}", first_name=first, last_name=last,
        dni=dni(pcounter), birthdate=(date(1972, 3, 1) + timedelta(days=(pcounter * 811) % 9000)).isoformat(), country="ES",
        email=f"composer2025.{i + 1}@example.com", phone=None, status="active", payment_status="paid", amount_paid_cents=3500,
        created_at="2025-06-01T10:00:00+02",
    ))
    rp_id = uid(f"rp:2025:{pid}")
    rps.append(dict(id=rp_id, round_id=final25, participant_id=pid, order=i + 1, draw_number=i + 1, is_qualified=False,
                    performance_minutes=8, performance_time=f"2025-11-15T{18 + (i * 25) // 60:02d}:{(i * 25) % 60:02d}",
                    performance_end_time=None, rehearsal_time=None, rehearsal_room=None, rehearsal_accompanist=None))
    for j_i, j in enumerate(JUDGES):
        scores.append(dict(id=uid(f"score:{rp_id}:{j}"), round_id=final25, participant_id=pid, judge_id=USERS[j],
                           value=score_val(i * 7 + j_i + 100, 9.5 - i * 0.6, 9.9 - i * 0.5), notes=None,
                           submitted_at="2025-11-15T21:00:00+01"))

# ─── 2027 draft: one category with its rounds (KAN-26 shape) ─────────────────

cat27 = uid("cat:2027")
categories.append(dict(id=cat27, contest_id=C3, name="Cor infantil", description="Obres per a cor d'infants (6-12 anys).", order=1, status="pending", max_participants=40))
for ro, (rk, rname) in enumerate([("sel", "Selecció de partitures"), ("final", "Final")], start=1):
    rounds.append(dict(id=uid(f"round:2027:{rk}"), category_id=cat27, name=rname, order=ro, status="pending",
                       scoring_type="vote" if rk == "sel" else "numeric", max_score=1 if rk == "sel" else 10,
                       is_final=(rk == "final"), is_ranking=False, is_published=False,
                       next_round_id=uid("round:2027:final") if rk == "sel" else None,
                       started_at=None, closed_at=None, session_date=None, session_start=None, session_end=None))

# Rounds reference their next round: insert finals first.
rounds.sort(key=lambda r: r["next_round_id"] is not None)

out.append("-- 6. Categories i rondes\n")
out.append(insert("categories", categories))
out.append(insert("rounds", rounds))
out.append("-- 7. Participants, respostes del formulari\n")
out.append(insert("participants", participants))
out.append(insert("participant_form_responses", responses))
out.append("-- 8. Catàleg d'obres\n")
out.append(insert("composers", composers))
out.append(insert("works", works))
out.append("-- 9. Participants per ronda, repertori, puntuacions\n")
out.append(insert("round_participants", rps))
out.append(insert("round_participant_works", rpworks))
out.append(insert("scores", scores))
out.append(f"""-- 10. Notificacions dins l'app de les comptes demo: la demo comença neta.
delete from notifications where user_id in (select id from auth.users where email like '%@contestsaas.demo');

commit;

-- Resum: {len(participants)} participants, {len(rps)} places a rondes, {len(scores)} puntuacions, {len(works)} obres.
""")

if "--json" in sys.argv:
    # Consumed by load_demo.mjs, which loads the same data through the API.
    print(json.dumps({
        "org": ORG,
        "org_update": {"name": PROFILE_NAMES["org"], "locale": "ca", "notification_email": None},
        "profiles": {USERS[k]: v for k, v in PROFILE_NAMES.items()},
        "demo_user_ids": list(USERS.values()),
        "accept_judges_in": [C1, C2],
        "tables": TABLES,
    }, ensure_ascii=False, default=str))
else:
    print("".join(out))
