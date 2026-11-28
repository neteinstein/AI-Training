import { createTranslator } from "next-intl";
import { describe, expect, test } from "vitest";
import type { ZodType } from "zod";
import { passwordChangeSchema } from "@/features/account/schemas";
import { areaSchema, levelSchema } from "@/features/catalog/schemas";
import { MESSAGE_MAX } from "@/features/conversations/constants";
import { messageSchema } from "@/features/conversations/schemas";
import { courseSchema } from "@/features/courses/schemas";
import { editionSchema } from "@/features/editions/schemas";
import {
  fileMaterialSchema,
  isEditableKind,
  materialSchemas,
  moduleSchema,
} from "@/features/materials/schemas";
import { QUIZ_MAX_OPTIONS, QUIZ_MAX_QUESTIONS, QUIZ_TEXT_MAX } from "@/features/quizzes/constants";
import {
  parseQuestions,
  quizProblems,
  quizSchema,
  sameQuestions,
} from "@/features/quizzes/schemas";
import { infoRequestSchema } from "@/features/requests/schemas";
import { inviteSchema, profileSchema, splitEmails } from "@/features/users/schemas";
import { checked, fieldErrors, fields, textList } from "@/lib/actions/validation";
import en from "../../messages/en.json";
import pt from "../../messages/pt.json";

const translate = {
  pt: createTranslator({ locale: "pt", messages: pt, namespace: "Validation" }),
  en: createTranslator({ locale: "en", messages: en, namespace: "Validation" }),
};

/** The translated message per invalid field, or null when the input is accepted. */
function problems(schema: ZodType, input: unknown, locale: "pt" | "en" = "pt") {
  const result = schema.safeParse(input);
  return result.success ? null : fieldErrors(result.error, translate[locale]);
}

const AREA_ID = "a1000000-0000-4000-8000-000000000001";
const LEVEL_ID = "b1000000-0000-4000-8000-000000000001";

describe("every validation message exists in both languages", () => {
  test("schemas only use keys of the Validation translations", () => {
    const samples: Array<[ZodType, unknown]> = [
      [areaSchema, {}],
      [
        courseSchema,
        { slug: "A b", area_id: "", level_id: "x", duration_hours: "muito", starts_on: "ontem" },
      ],
      [editionSchema, { name_pt: "", starts_on: "x", ends_on: "2027-01-01", is_listed: true }],
      [editionSchema, { name_pt: "a", name_en: "b", starts_on: "", ends_on: "", is_listed: true }],
      [
        editionSchema,
        {
          name_pt: "a",
          name_en: "b",
          starts_on: "2027-02-02",
          ends_on: "2027-02-01",
          is_listed: 0,
        },
      ],
      [materialSchemas.video, { url: "https://example.org", is_published: true }],
      [materialSchemas.embed, { url: "https://example.org", is_published: true }],
      [materialSchemas.link, { url: "nada", is_published: true }],
      [materialSchemas.page, { is_published: false }],
      [fileMaterialSchema, { is_published: false }],
      [materialSchemas.quiz, { is_published: "yes" }],
      [quizSchema, []],
      [quizSchema, [{}, { prompt: { pt: "", en: "" }, explanation: {}, options: [{}] }]],
      [
        quizSchema,
        [
          {
            prompt: { pt: "x".repeat(QUIZ_TEXT_MAX + 1), en: "" },
            explanation: { pt: "", en: "" },
            options: [
              { label: { pt: "", en: "" }, correct: false },
              { label: { pt: "b", en: "" }, correct: "sim" },
            ],
          },
        ],
      ],
      [inviteSchema, { emails: "a, b@", locale: "fr", role: "admin", mode: "sms" }],
      [infoRequestSchema, { name: "", email: "x", course_id: "1" }],
      [passwordChangeSchema, { current: "a", password: "a", confirm: "b" }],
      [messageSchema, {}],
      [messageSchema, { body: "x".repeat(MESSAGE_MAX + 1) }],
    ];
    for (const [schema, input] of samples) {
      const result = schema.safeParse(input);
      expect(result.success).toBe(false);
      if (result.success) continue;
      for (const issue of result.error.issues) {
        // zod's own wording would mean a schema forgot to name a translation key.
        expect(Object.keys(pt.Validation), issue.message).toContain(issue.message);
      }
    }
  });
});

describe("areas and levels", () => {
  const area = {
    slug: " Professores ",
    name_pt: " Professores ",
    name_en: "Teachers",
    description_pt: "",
    description_en: " For teachers ",
    color: "ochre",
    icon: "graduation-cap",
  };

  test("a valid area becomes the shape the database functions take", () => {
    expect(areaSchema.parse(area)).toEqual({
      slug: "professores",
      name: { pt: "Professores", en: "Teachers" },
      description: { pt: "", en: "For teachers" },
      color: "ochre",
      icon: "graduation-cap",
    });
  });

  test("names are needed in both languages, and the address has a fixed shape", () => {
    expect(problems(areaSchema, { ...area, name_en: " ", slug: "área de ensino" })).toEqual({
      name_en: "Preencha este campo.",
      slug: "Use apenas letras minúsculas sem acentos, números e hífenes (por exemplo, ia-na-sala-de-aula).",
    });
    expect(problems(areaSchema, { ...area, color: "magenta", icon: "skull" }, "en")).toEqual({
      color: "Choose an option.",
      icon: "Choose an option.",
    });
    expect(problems(levelSchema, { ...area, name_pt: "x".repeat(121) })).toEqual({
      name_pt: "Use no máximo 120 caracteres.",
    });
  });
});

describe("courses", () => {
  const course = {
    slug: "ia-na-sala-de-aula",
    area_id: AREA_ID,
    level_id: LEVEL_ID,
    title_pt: "IA na sala de aula",
    title_en: "AI in the classroom",
    summary_pt: "",
    summary_en: "",
    description_pt: "## Programa\n\n    código\n",
    description_en: "",
    duration_hours: "",
    starts_on: "2027-02-13",
    location: " Lisboa ",
  };

  test("hours are read the way people type them", () => {
    const hours = (value: string) =>
      courseSchema.parse({ ...course, duration_hours: value }).durationHours;
    expect(hours("")).toBeNull();
    expect(hours(" 8 ")).toBe(8);
    expect(hours("7,5")).toBe(7.5);
    expect(hours("7.5")).toBe(7.5);

    for (const bad of ["0", "0,2", "1000", "-3", "oito", "7,55", "1e3"]) {
      expect(problems(courseSchema, { ...course, duration_hours: bad }), bad).toEqual({
        duration_hours: "Indique as horas com um número entre 0,5 e 999 (por exemplo, 8 ou 7,5).",
      });
    }
  });

  test("a description keeps its Markdown spacing", () => {
    expect(courseSchema.parse(course).description.pt).toBe("## Programa\n\n    código\n");
  });

  test("the date and the place are required", () => {
    expect(courseSchema.parse(course)).toMatchObject({
      startsOn: "2027-02-13",
      location: "Lisboa",
    });
    expect(problems(courseSchema, { ...course, starts_on: "", location: "  " })).toEqual({
      starts_on: "Preencha este campo.",
      location: "Preencha este campo.",
    });
    const { starts_on: _date, location: _place, ...withoutEither } = course;
    expect(Object.keys(problems(courseSchema, withoutEither) ?? {})).toEqual([
      "starts_on",
      "location",
    ]);
    expect(problems(courseSchema, { ...course, location: "x".repeat(121) }, "en")).toEqual({
      location: "Use at most 120 characters.",
    });
  });

  test("the date is a real day, as a date input sends it", () => {
    for (const bad of ["13/02/2027", "2027-2-13", "2027-02-30", "2027-13-01", "amanhã"]) {
      expect(problems(courseSchema, { ...course, starts_on: bad }), bad).toEqual({
        starts_on: "Indique uma data válida.",
      });
    }
    expect(courseSchema.parse({ ...course, starts_on: "2028-02-29" }).startsOn).toBe("2028-02-29");
  });

  test("an area and a level must be chosen", () => {
    expect(problems(courseSchema, { ...course, area_id: "", level_id: "1' or '1'='1" })).toEqual({
      area_id: "Escolha uma opção.",
      level_id: "Escolha uma opção.",
    });
  });
});

describe("editions", () => {
  const edition = { name_pt: " Turma ", name_en: "Class", starts_on: "", ends_on: "" };

  test("the name is needed in both languages; dates are optional", () => {
    expect(editionSchema.parse({ ...edition, is_listed: false })).toEqual({
      name: { pt: "Turma", en: "Class" },
      startsOn: null,
      endsOn: null,
      isListed: false,
    });
    expect(problems(editionSchema, { ...edition, name_en: " ", is_listed: false })).toEqual({
      name_en: "Preencha este campo.",
    });
  });

  test("dates are real days, in order, and there when the edition is public", () => {
    const check = (values: Record<string, unknown>, locale: "pt" | "en" = "pt") =>
      problems(editionSchema, { ...edition, is_listed: false, ...values }, locale);

    expect(check({ starts_on: "2027-02-30" })).toEqual({
      starts_on: "Indique uma data válida.",
    });
    expect(check({ ends_on: "2027-03-01" })).toEqual({
      starts_on: "Indique o primeiro dia, ou apague o último.",
    });
    expect(check({ is_listed: true })).toEqual({
      starts_on: "Indique o primeiro dia para mostrar a edição no site público.",
    });
    expect(check({ starts_on: "2027-03-10", ends_on: "2027-03-01" }, "en")).toEqual({
      ends_on: "The last day cannot be before the first.",
    });
    // One day is a fine edition.
    expect(
      editionSchema.parse({
        ...edition,
        starts_on: "2027-03-01",
        ends_on: "2027-03-01",
        is_listed: true,
      }),
    ).toMatchObject({ startsOn: "2027-03-01", endsOn: "2027-03-01", isListed: true });
  });
});

describe("modules and materials", () => {
  const details = {
    title_pt: "Diapositivos",
    title_en: "",
    description_pt: "",
    description_en: "",
    content_language: "",
    edition_id: "",
    is_published: true,
  };

  test("a title in one language is enough, none is not", () => {
    const section = {
      title_pt: "",
      title_en: " Planning ",
      description_pt: "",
      description_en: "",
    };
    expect(moduleSchema.parse(section).title).toEqual({ pt: "", en: "Planning" });
    expect(problems(moduleSchema, { ...section, title_en: " " })).toEqual({
      title_pt: "Preencha este campo em pelo menos um dos idiomas.",
    });
  });

  test("each kind only accepts addresses it can show", () => {
    const youtube = "https://youtu.be/aqz-KE-bpKQ?t=90";
    const slides =
      "https://docs.google.com/presentation/d/1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc/edit";

    expect(materialSchemas.video.parse({ ...details, url: ` ${youtube} ` })).toEqual({
      kind: "video",
      url: youtube,
      title: { pt: "Diapositivos", en: "" },
      description: { pt: "", en: "" },
      contentLanguage: null,
      editionId: null,
      isPublished: true,
    });
    expect(
      materialSchemas.embed.parse({ ...details, url: slides, content_language: "en" }),
    ).toMatchObject({ kind: "embed", contentLanguage: "en" });
    expect(materialSchemas.link.parse({ ...details, url: "http://example.org/a" }).kind).toBe(
      "link",
    );

    expect(problems(materialSchemas.video, { ...details, url: slides })).toEqual({
      url: "Cole a ligação de um vídeo do YouTube ou do Vimeo.",
    });
    expect(problems(materialSchemas.embed, { ...details, url: youtube }, "en")).toEqual({
      url: "Paste the sharing link of a Google Slides, Docs, Sheets or Drive file.",
    });
    expect(problems(materialSchemas.link, { ...details, url: "javascript:alert(1)" })).toEqual({
      url: "Introduza um endereço completo, começando por https://.",
    });
    expect(problems(materialSchemas.link, { ...details, url: "" })).toEqual({
      url: "Preencha este campo.",
    });
  });

  test("a text page needs text in one language", () => {
    const page = { ...details, body_pt: "", body_en: "# Guide\n\nText.\n" };
    expect(materialSchemas.page.parse(page)).toMatchObject({
      kind: "page",
      body: { pt: "", en: "# Guide\n\nText.\n" },
    });
    expect(problems(materialSchemas.page, { ...page, body_en: "  \n" })).toEqual({
      body_pt: "Preencha este campo em pelo menos um dos idiomas.",
    });
  });

  test("an uploaded file needs the file", () => {
    expect(
      problems(fileMaterialSchema, {
        ...details,
        module_id: LEVEL_ID,
        storage_path: "",
        original_name: "",
      }),
    ).toEqual({ storage_path: "Escolha um ficheiro.", original_name: "Escolha um ficheiro." });
  });

  test("only the four editable kinds have a form", () => {
    expect(["video", "embed", "link", "page"].every(isEditableKind)).toBe(true);
    expect(isEditableKind("file")).toBe(false);
    expect(isEditableKind("constructor")).toBe(false);
  });
});

describe("invitations", () => {
  const invite = {
    emails: "ana@example.org",
    full_name: " Ana Santos ",
    locale: "pt",
    role: "learner",
    course_ids: [AREA_ID, "nonsense", AREA_ID],
    mode: "email",
  };

  test("addresses can be pasted in any common form", () => {
    expect(
      splitEmails(
        "Ana@Example.org; rui@example.org,\n\n  Marta Lopes <marta@example.org>, ana@example.org.",
      ),
    ).toEqual(["ana@example.org", "rui@example.org", "marta@example.org"]);
    expect(splitEmails("  \n ")).toEqual([]);
  });

  test("a valid form becomes an invitation", () => {
    expect(inviteSchema.parse(invite)).toEqual({
      emails: ["ana@example.org"],
      fullName: "Ana Santos",
      locale: "pt",
      role: "learner",
      courseIds: [AREA_ID],
      mode: "email",
    });
  });

  test("mistyped addresses are named, so they can be fixed", () => {
    expect(problems(inviteSchema, { ...invite, emails: "ana@example.org, rui@, marta" })).toEqual({
      emails: "Verifique estes endereços: rui@, marta",
    });
    expect(problems(inviteSchema, { ...invite, emails: "rui@" }, "en")).toEqual({
      emails: "Check this address: rui@",
    });
    expect(problems(inviteSchema, { ...invite, emails: " " })).toEqual({
      emails: "Preencha este campo.",
    });
  });

  test("at most a hundred people at a time", () => {
    const many = Array.from({ length: 101 }, (_, index) => `p${index}@example.org`).join("\n");
    expect(problems(inviteSchema, { ...invite, emails: many })).toEqual({
      emails: "Convide no máximo 100 pessoas de cada vez.",
    });
  });

  test("a profile is a name and one of the two languages", () => {
    expect(profileSchema.parse({ full_name: " Ana ", locale: "en" })).toEqual({
      fullName: "Ana",
      locale: "en",
    });
    expect(problems(profileSchema, { full_name: "Ana", locale: "fr" })).toEqual({
      locale: "Escolha uma opção.",
    });
  });
});

describe("information requests", () => {
  const request = {
    name: " Maria Santos ",
    email: " Maria@Example.org ",
    organisation: "",
    course_id: "",
    message: "",
    locale: "pt",
    consent: true,
  };

  test("only name, email and the consent box are required", () => {
    expect(infoRequestSchema.parse(request)).toEqual({
      name: "Maria Santos",
      email: "maria@example.org",
      organisation: undefined,
      courseId: undefined,
      message: undefined,
      locale: "pt",
    });
    expect(infoRequestSchema.parse({ ...request, course_id: AREA_ID }).courseId).toBe(AREA_ID);
  });

  test("without consent nothing is sent", () => {
    expect(problems(infoRequestSchema, { ...request, consent: false })).toEqual({
      consent: "Assinale esta caixa para podermos responder ao seu pedido.",
    });
    expect(problems(infoRequestSchema, { ...request, consent: undefined }, "en")).toEqual({
      consent: "Tick this box so that we can reply to your request.",
    });
  });

  test("problems are explained per field", () => {
    expect(
      problems(infoRequestSchema, {
        ...request,
        name: "",
        email: "maria@",
        message: "x".repeat(4001),
      }),
    ).toEqual({
      name: "Preencha este campo.",
      email: "Introduza um email válido.",
      message: "Use no máximo 4000 caracteres.",
    });
  });
});

describe("messages between learners and trainers", () => {
  test("a message is some text, kept as written but for the space around it", () => {
    expect(messageSchema.parse({ body: "  Uma pergunta,\n\ncom duas linhas.  \n" })).toEqual({
      body: "Uma pergunta,\n\ncom duas linhas.",
    });
    expect(messageSchema.parse({ body: "x".repeat(MESSAGE_MAX) }).body.length).toBe(MESSAGE_MAX);
  });

  test("an empty one, or one that is too long, is refused with the reason", () => {
    expect(problems(messageSchema, { body: " \n\t " })).toEqual({ body: "Preencha este campo." });
    expect(problems(messageSchema, { body: "x".repeat(MESSAGE_MAX + 1) }, "en")).toEqual({
      body: `Use at most ${MESSAGE_MAX} characters.`,
    });
  });
});

describe("changing a password", () => {
  test("the new one must be long enough, repeated correctly and actually new", () => {
    const ok = {
      current: "palavra-antiga-1",
      password: "palavra-nova-22",
      confirm: "palavra-nova-22",
    };
    expect(problems(passwordChangeSchema, ok)).toBeNull();
    expect(problems(passwordChangeSchema, { ...ok, password: "curta", confirm: "curta" })).toEqual({
      password: "Use pelo menos 10 caracteres.",
    });
    expect(problems(passwordChangeSchema, { ...ok, confirm: "outra-coisa-33" })).toEqual({
      confirm: "As palavras-passe não coincidem.",
    });
    expect(
      problems(passwordChangeSchema, { ...ok, password: ok.current, confirm: ok.current }),
    ).toEqual({ password: "A nova palavra-passe tem de ser diferente da atual." });
  });
});

describe("reading forms", () => {
  test("fields, lists and switches", () => {
    const form = new FormData();
    form.set("title_pt", "Título");
    form.append("course_ids", "a");
    form.append("course_ids", "b");
    form.set("is_published", "on");
    form.set("file", new Blob(["x"]), "x.txt");

    expect(fields(form, ["title_pt", "title_en", "file"])).toEqual({
      title_pt: "Título",
      title_en: "",
      file: "",
    });
    expect(textList(form, "course_ids")).toEqual(["a", "b"]);
    expect(textList(form, "missing")).toEqual([]);
    expect(checked(form, "is_published")).toBe(true);
    expect(checked(form, "other")).toBe(false);
  });
});

describe("quizzes", () => {
  const text = (pt: string, en = "") => ({ pt, en });
  const option = (label: string, correct = false) => ({ label: text(label), correct });
  const question = (prompt: string, options = [option("Sim", true), option("Não")]) => ({
    prompt: text(prompt),
    explanation: text(""),
    options,
  });
  // (Any key, with whatever values it needs: the keys are checked by the test at the top.)
  const say = translate.pt as (key: string, values?: Record<string, string | number>) => string;
  /** The message for each question a quiz is refused for, in Portuguese. */
  const refused = (input: unknown) => {
    const result = quizSchema.safeParse(input);
    if (result.success) return null;
    return Object.fromEntries(
      quizProblems(result.error).map((problem) => [
        problem.question ?? "quiz",
        say(problem.message, problem.values),
      ]),
    );
  };

  test("a quiz is questions with a text, two options or more and a right answer", () => {
    const parsed = quizSchema.safeParse([
      {
        prompt: { pt: "  Quanto é 2 + 2?  ", en: "" },
        explanation: { pt: " Soma simples. ", en: "" },
        options: [
          { label: { pt: " 4 ", en: "4" }, correct: true },
          { label: { pt: "5", en: "" }, correct: false },
        ],
      },
    ]);
    expect(parsed.success && parsed.data).toEqual([
      {
        prompt: { pt: "Quanto é 2 + 2?", en: "" },
        explanation: { pt: "Soma simples.", en: "" },
        options: [
          { label: { pt: "4", en: "4" }, correct: true },
          { label: { pt: "5", en: "" }, correct: false },
        ],
      },
    ]);
    // English alone is as good as Portuguese alone, and several answers may be right.
    expect(
      refused([
        {
          prompt: text("", "Pick the even numbers"),
          explanation: text(""),
          options: [
            { label: text("", "2"), correct: true },
            { label: text("", "3"), correct: false },
            { label: text("", "4"), correct: true },
          ],
        },
      ]),
    ).toBeNull();
  });

  test("what is missing is said for the question it is missing in", () => {
    expect(refused([])).toEqual({ quiz: "Acrescente pelo menos uma pergunta." });
    expect(refused("nada")).toEqual({ quiz: "Preencha este campo." });
    expect(
      refused([
        question("Certa?"),
        question("  "),
        question("Só uma resposta", [option("Sim", true)]),
        question("Nenhuma certa", [option("Sim"), option("Não")]),
        question("Resposta em branco", [option("Sim", true), option(" ")]),
      ]),
    ).toEqual({
      2: "Escreva a pergunta em pelo menos um dos idiomas.",
      3: "Cada pergunta precisa de pelo menos duas respostas.",
      4: "Assinale pelo menos uma resposta certa.",
      5: "Escreva cada resposta em pelo menos um dos idiomas.",
    });
  });

  test("the limits are said with their numbers", () => {
    const many = Array.from({ length: QUIZ_MAX_OPTIONS + 1 }, (_, index) =>
      option(`Resposta ${index}`, index === 0),
    );
    expect(refused([question("Demasiadas", many)])).toEqual({
      1: `Use no máximo ${QUIZ_MAX_OPTIONS} respostas por pergunta.`,
    });
    expect(
      refused(Array.from({ length: QUIZ_MAX_QUESTIONS + 1 }, () => question("Outra"))),
    ).toEqual({ quiz: `Use no máximo ${QUIZ_MAX_QUESTIONS} perguntas.` });
    expect(refused([question("x".repeat(QUIZ_TEXT_MAX + 1))])?.[1]).toContain(
      String(QUIZ_TEXT_MAX),
    );
  });

  test("the editor's value is read as it was sent, and anything else as no questions", () => {
    expect(parseQuestions(JSON.stringify([question("Uma")]))).toEqual([question("Uma")]);
    expect(parseQuestions("")).toEqual([]);
    expect(parseQuestions("{nope")).toEqual([]);
  });

  test("two quizzes are the same when they say the same, whatever the spaces", () => {
    const stored = [question("Uma"), question("Duas")];
    expect(sameQuestions(stored, [question(" Uma "), question("Duas")])).toBe(true);
    expect(sameQuestions(stored, [question("Duas"), question("Uma")])).toBe(false);
    expect(sameQuestions(stored, [question("Uma")])).toBe(false);
    expect(
      sameQuestions(stored, [question("Uma", [option("Sim"), option("Não", true)]), stored[1]]),
    ).toBe(false);
    expect(
      sameQuestions(stored, [{ ...stored[0], explanation: text("Porque sim.") }, stored[1]]),
    ).toBe(false);
    expect(sameQuestions([], [])).toBe(true);
  });

  test("a quiz is a material like the others: a title and where it is shown", () => {
    expect(isEditableKind("quiz")).toBe(true);
    const details = {
      title_pt: "Verifique o que aprendeu",
      title_en: "",
      description_pt: "",
      description_en: "",
      content_language: "",
      edition_id: "",
      is_published: true,
    };
    expect(problems(materialSchemas.quiz, { ...details, title_pt: " " })).toEqual({
      title_pt: "Preencha este campo em pelo menos um dos idiomas.",
    });
    const parsed = materialSchemas.quiz.safeParse(details);
    expect(parsed.success && parsed.data).toMatchObject({
      kind: "quiz",
      title: { pt: "Verifique o que aprendeu", en: "" },
      editionId: null,
      isPublished: true,
    });
  });
});
