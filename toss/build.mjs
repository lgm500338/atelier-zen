// 토스 번들용 dist/ 만들기: 웹과 같은 ../index.html을 그대로 복사해요.
// (토스 SDK와 인앱 광고 코드는 index.html 안에 이미 들어 있어요.)
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", readFileSync("../index.html", "utf8"));
console.log("dist/index.html 준비 완료");
