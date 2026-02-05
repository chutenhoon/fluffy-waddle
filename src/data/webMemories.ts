export type WebMemory = {
  slug: string;
  title: string;
  subtitle?: string;
};

export const webMemories: WebMemory[] = [
  {
    slug: "Loinhanchoem",
    title: "Lời nhắn cho em",
    subtitle: "Lời nhắn gửi riêng"
  },
  {
    slug: "20th11",
    title: "20/11",
    subtitle: "Một ngày đặc biệt"
  },
  {
    slug: "Caythong",
    title: "Cây thông",
    subtitle: "Khoảnh khắc ấm áp"
  },
  {
    slug: "Emdungkhoc",
    title: "Em đừng khóc",
    subtitle: "Gửi lời an ủi"
  }
];

export function webMemoryUrl(slug: string) {
  return `/webmemory/${slug}/index.html`;
}
