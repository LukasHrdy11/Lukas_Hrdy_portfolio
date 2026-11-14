import yaml from 'js-yaml';
import raw from '../../content/profile.yaml?raw';
import type { Localized } from './typo';

type L = { cs: string; en: string };

export interface ProjectLink { label: L; url: string; primary?: boolean }

export interface FeaturedProject {
  slug: string;
  title: L;
  period: string;
  org: L;
  supervisor?: string;
  tags: string[];
  award?: L;
  summary: L;
  body: { cs: string[]; en: string[] };
  results: L[];
  caveat?: L;
  visualization?: string;
  links: ProjectLink[];
  web?: boolean;
}

export interface OtherProject {
  slug: string;
  title: L;
  period: string;
  org: L;
  supervisor?: string;
  tags: string[];
  summary: L;
  image?: { src: string; alt: L };
  web?: boolean;
}

export interface TimelineItem {
  period: string;
  title: L;
  org?: L;
  supervisor?: string;
  project?: string;
  web?: boolean;
}

export interface Profile {
  person: { name: string; email: string; photo: string; headline: L; tagline: L };
  links: { id: string; label: string; url: string; web?: boolean }[];
  about: L;
  interests: L[];
  featured_projects: FeaturedProject[];
  other_projects: OtherProject[];
  experience: TimelineItem[];
  education: TimelineItem[];
  awards: { date: string; title: L; detail?: L; web?: boolean }[];
  outreach: {
    items: { period: string; title: L; detail?: L; web?: boolean }[];
    videos: { title: string; youtube_id?: string }[];
    astrocamp_lightcurve: { data: string; show: string; caption: L };
  };
  skills: { area: L; items: Localized }[];
  languages: { name: L; level: L }[];
  language_stays: L[];
}

export const profile = yaml.load(raw) as Profile;

/** Items flagged `web: false` in the YAML are CV-only. */
export const onWeb = <T extends { web?: boolean }>(items: T[]): T[] =>
  items.filter((item) => item.web !== false);
