import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import fs from "fs/promises"

const TITLE_REGEX = /\{post_title_line\|\d+\|(single|multi)\}/gm;
const DESCRIPTION_REGEX = /\{post_description_lines\|\d+\|(single|multi)\}/gm;

const IN_PATH = "./README_template.md";
const OUT_PATH = "./README.md";

const REPLACE_BORDER = {
    start: "| ",
    end: " |"
}

type Placeholder = "post_title_line" | "post_description_lines";

type Replacable = {
    placeholder: Placeholder,
    length: number,
    multiLine: boolean
}

type Post = {
    title: string,
    description: string
}

const parseReplacable = (src: string, regex: RegExp): Replacable[] =>
    src.match(regex)?.map(it => {
        const [ p, l, m ] = it.slice(1, -1).split("|");
        return {
            placeholder: p as Placeholder,
            length: parseInt(l),
            multiLine: m === "multi"
        }
    }) ?? [];

const replacableToPlaceholder = ({ placeholder, length, multiLine }: Replacable) =>
    `{${placeholder}|${length}|${multiLine ? "multi" : "single"}}`

const nString = (n: number, c: string) => Array(n).fill(c).join("")

const centerPad = (text: string, maxLength: number) => {
    if(text.length >= maxLength) return text;

    const diff = maxLength - text.length;
    return nString(Math.floor(diff / 2), " ") + text + nString(Math.ceil(diff / 2), " ");
}

const formatTextWithReplacable = (text: string, replacable: Replacable): string => {
    if(!replacable.multiLine)
        return REPLACE_BORDER.start + centerPad(text.length > replacable.length ? text.slice(0, replacable.length - 3) + "..." : text, replacable.length) + REPLACE_BORDER.end;
    
    const lines: string[] = text.split(" ").reduce<string[]>((acc, curr) => {
        let last = acc.at(-1);
        if(!last || (last + curr).length >= replacable.length) acc.push(curr);
        else acc[acc.length - 1] = last + " " + curr;

        return acc;
    }, []);

    return lines.map(it => REPLACE_BORDER.start + centerPad(it, replacable.length) + REPLACE_BORDER.end).join("\n");
}

(async () => {
    const template = await fs.readFile(IN_PATH, { encoding: "utf-8" });

    const titles = parseReplacable(template, TITLE_REGEX);
    const descriptions = parseReplacable(template, DESCRIPTION_REGEX);

    const rss: string | false = await axios.get("https://antony.cloud/rss.xml").then(res => res.data).catch(() => false);
    if(!rss)
        return;

    // item will not be an array in case there is no posts, this most likely won't ever happen, but if I ever delete all my posts except one, we will have a fail safe lol
    const parsed: { rss: { channel: { item: Post | Post[] } } } = new XMLParser().parse(rss);
    const posts = Array.isArray(parsed.rss.channel.item) ? parsed.rss.channel.item : [parsed.rss.channel.item]
    
    const latestPost = posts.at(0);
    if(!latestPost) return;
    
    let final = template;

    for(const title of titles)
        final = final.replace(replacableToPlaceholder(title), formatTextWithReplacable(latestPost.title, title));

    for(const description of descriptions)
        final = final.replace(replacableToPlaceholder(description), formatTextWithReplacable(latestPost.description, description));

    await fs.writeFile(OUT_PATH, final, { encoding: "utf-8" });
})()