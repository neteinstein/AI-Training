import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { CourseWhenWhere } from "@/components/catalog/course-when-where";
import en from "../../messages/en.json";
import pt from "../../messages/pt.json";

type Course = { startsOn: string | null; location: string | null };

const render = (locale: "pt" | "en", course: Course, timeZone = "Europe/Lisbon") =>
  renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "pt" ? pt : en}
      timeZone={timeZone}
    >
      <CourseWhenWhere course={course} />
    </NextIntlClientProvider>,
  );

describe("when and where a course takes place", () => {
  const course = { startsOn: "2027-02-13", location: "Lisboa" };

  test("shows the day in the reader's language, and the place", () => {
    const html = render("pt", course);
    expect(html).toContain('<time dateTime="2027-02-13">13 de fev. de 2027</time>');
    expect(html).toContain("Lisboa");
    expect(html).toContain("Data: ");
    expect(html).toContain("Local: ");
    expect(render("en", course)).toContain(">Feb 13, 2027</time>");
  });

  test("the day does not move with the time zone", () => {
    expect(render("en", course, "Pacific/Pago_Pago")).toContain(">Feb 13, 2027</time>");
    expect(render("en", course, "Pacific/Kiritimati")).toContain(">Feb 13, 2027</time>");
  });

  test("a course from before these fields existed shows what it has", () => {
    expect(render("pt", { startsOn: null, location: null })).toBe("");
    const placeOnly = render("pt", { startsOn: null, location: "Online" });
    expect(placeOnly).toContain("Online");
    expect(placeOnly).not.toContain("<time");
  });
});
