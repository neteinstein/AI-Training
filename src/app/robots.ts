import type { MetadataRoute } from "next";
import { siteUrl } from "@/config/site";

/** Search engines may read the public site; everything behind sign-in is kept out. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/*/learn", "/*/trainer", "/*/auth/", "/*/login", "/*/forgot-password"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
