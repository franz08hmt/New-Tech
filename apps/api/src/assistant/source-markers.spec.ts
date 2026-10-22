import { describe, expect, it } from "vitest";
import {
  isSourceId,
  sameSourceIdSet,
  scanSourceMarkers,
} from "./source-markers.js";

describe("scanSourceMarkers", () => {
  it.each([
    ["no marker", "Plain answer.", [], []],
    ["one marker", "Claim [S1].", ["[S1]"], ["S1"]],
    ["repeated marker", "A [S1]. B [S1].", ["[S1]", "[S1]"], ["S1", "S1"]],
    ["several sources", "A [S3] B [S1]", ["[S3]", "[S1]"], ["S3", "S1"]],
    ["multi-digit source", "A [S12]", ["[S12]"], ["S12"]],
    ["ordinary brackets", "See (S1), [1], [s1], {S1}, [note].", [], []],
  ])("accepts %s", (_name, text, sourceLike, ids) => {
    expect(scanSourceMarkers(text)).toEqual({
      sourceLike,
      ids,
      malformed: false,
    });
  });

  it.each([
    ["grouped", "A [S1, S2]"],
    ["empty", "A [S]"],
    ["zero", "A [S0]"],
    ["leading zero", "A [S01]"],
    ["trailing text", "A [S1a]"],
    ["descriptive", "A [Source: x]"],
    ["nested", "A [S[S1]"],
    ["nested around a valid marker", "A [Sx[S1] and [S1]"],
    ["unterminated then valid", "A [S1 and later [S2]"],
  ])("flags %s as malformed", (_name, text) => {
    expect(scanSourceMarkers(text).malformed).toBe(true);
  });

  it("does not count a valid-looking marker nested inside broken syntax", () => {
    // Counting source-like and valid matches separately would call this clean.
    expect(scanSourceMarkers("A [S[S1]")).toEqual({
      sourceLike: ["[S[S1]"],
      ids: [],
      malformed: true,
    });
  });

  it("can be called repeatedly without sticky regex state", () => {
    for (let i = 0; i < 3; i++)
      expect(scanSourceMarkers("A [S1] [S2]").ids).toEqual(["S1", "S2"]);
  });
});

describe("sameSourceIdSet", () => {
  it.each([
    [["S1"], ["S1"], true],
    [["S1", "S1"], ["S1"], true],
    [["S2", "S1"], ["S1", "S2"], true],
    [[], [], true],
    [["S1"], ["S1", "S2"], false],
    [["S1", "S2"], ["S1"], false],
    [["S1"], ["S2"], false],
    [[], ["S1"], false],
  ])("%j vs %j is %s", (left, right, expected) => {
    expect(sameSourceIdSet(left, right)).toBe(expected);
  });
});

describe("isSourceId", () => {
  it.each(["S1", "S9", "S10", "S123"])("accepts %s", (id) => {
    expect(isSourceId(id)).toBe(true);
  });
  it.each([
    "S0",
    "S01",
    "s1",
    "S1a",
    "1",
    "",
    " S1",
    "[S1]",
    1,
    null,
    undefined,
  ])("rejects %j", (id) => {
    expect(isSourceId(id)).toBe(false);
  });
});
