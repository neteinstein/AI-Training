import { createTranslator } from "next-intl";
import { describe, expect, test } from "vitest";
import type { ZodType } from "zod";
import { passwordChangeSchema } from "@/features/account/schemas";
import { areaSchema, levelSchema } from "@/features/catalog/schemas";
import { courseSchema } from "@/features/courses/schemas";
import {
  fileMaterialSchema,
  isEditableKind,
  materialSchemas,
  moduleSchema,
} from "@/features/materials/schemas";
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
      [courseSchema, { slug: "A b", area_id: "", level_id: "x", duration_hours: "muito" }],
      [materialSchemas.video, { url: "https://example.org", is_published: true }],
      [materialSchemas.embed, { url: "https://example.org", is_published: true }],
      [materialSchemas.link, { url: "nada", is_published: true }],
      [materialSchemas.page, { is_published: false }],
      [fileMaterialSchema, { is_published: false }],
      [inviteSchema, { emails: "a, b@", locale: "fr", role: "admin", mode: "sms" }],
      [infoRequestSchema, { name: "", email: "x", course_id: "1" }],
      [passwordChangeSchema, { current: "a", password: "a", confirm: "b" }],
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

  test("an area and a level must be chosen", () => {
    expect(problems(courseSchema, { ...course, area_id: "", level_id: "1' or '1'='1" })).toEqual({
      area_id: "Escolha uma opção.",
      level_id: "Escolha uma opção.",
    });
  });
});

describe("modules and materials", () => {
  const details = {
    title_pt: "Diapositivos",
    title_en: "",
    description_pt: "",
    description_en: "",
    content_language: "",
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
  };

  test("only name and email are required", () => {
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
