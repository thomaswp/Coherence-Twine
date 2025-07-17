// Macro.add("door", {
//     handler() {
//         const [
//             text, 
//             roomName, 
//             variableName, 
//             defaultState
//         ] = this.args;

//         if (State.variables[variableName] === undefined) {
//             State.variables[variableName] = defaultState;
//         }
//         if (State.variables[variableName]) {
//             const out = Wikifier.wikifyEval(`<<link "${text}" |${roomName}]]`);
//         } else {
//             const out = Wikifier.wikifyEval(`[[${text}|${roomName}]]`);
//             this.output.append(out);

//         }
//         return text;
//     }
// });

