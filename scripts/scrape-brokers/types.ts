export type RawListing = {
  name: string;
  street?: string;
  zip?: string;
  city: string;
  phone?: string;
  website?: string;
  source: string;
  sourceUrl?: string;
};

export type EnrichedBroker = RawListing & {
  emails: string[];
  phonesExtra: string[];
  employeesEstimate: number | null;
  employeesMethod: "team-page" | "northdata" | "impressum-text" | null;
  employeesSourceUrl?: string;
  crawlError?: string;
};

export type CsvRow = {
  name: string;
  street: string;
  zip: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  employeesEstimate: string;
  employeesMethod: string;
  source: string;
  sourceUrl: string;
};
