import React from "react";
import {Hook} from "./Hook";
import {Humours} from "./Humours";
import {Kill} from "./Kill";
import {Bow} from "./Bow";
import {Worry} from "./Worry";
import {Chest} from "./Chest";
import {Joy} from "./Joy";
import {Air} from "./Air";
import {Soul} from "./Soul";
import {Crisis} from "./Crisis";
import {Credits, Lessons} from "./Lessons";

export const BODIES: Record<string, React.FC> = {
  hook: Hook, humours: Humours, kill: Kill, bow: Bow, worry: Worry, chest: Chest,
  joy: Joy, air: Air, soul: Soul, crisis: Crisis, lessons: Lessons, credits: Credits,
};
