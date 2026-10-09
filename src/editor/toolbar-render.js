/*
 * Rendering the tool list for a toolbar category, and the status message.
 */

import enggDrawingState from "../core/model/drawing-state.js";
import { disciplineToolGroups, drawingToolGroups, engineeringTools } from "./tools.js";
import { ANALYSIS_DIAGRAM_TOOLS, STATICS_ANALYSIS_TOOLS, runStaticsAnalysis } from "./analysis-tools.js";
import { renderCurrentDrawing } from "./canvas-render.js";
import { drawingToolMessage, toolHeading, toolList } from "./dom.js";
import { drawingState } from "./editor-state.js";
import { renderProperties } from "./feature-panel.js";
import { STATICS_TOOL_MENUS, openAnalysisModeMenu, openCoordinateSystemMenu, openStaticsMenu } from "./statics-tools.js";
import { activateTool } from "./tool-activation.js";
import { activeCategory, openArcMenu, openPolygonMenu, renderToolButton, toolDefinitionForLabel } from "./tool-menus.js";

export function renderEngineeringTools(
    category
) {
    const safeCategory =
        engineeringTools[category]
            ? category
            : "GEOMETRY";

    toolHeading.textContent =
        `${safeCategory} TOOLS`;

    if (
        safeCategory ===
            "GEOMETRY" ||
        disciplineToolGroups[safeCategory]
    ) {
        /*
         * GEOMETRY and STATICS are organised into labelled
         * sections; every other discipline stays a flat
         * list of tools.
         */
        const groups =
            safeCategory === "GEOMETRY"
                ? drawingToolGroups
                : disciplineToolGroups[safeCategory];

        toolList.innerHTML =
            groups
                .map(
                    group => `
                        <section
                            class="drawing-tool-group"
                            aria-labelledby="drawing-group-${group.id}"
                        >
                            <h3
                                class="drawing-tool-group-label"
                                id="drawing-group-${group.id}"
                            >
                                ${group.label}
                            </h3>

                            ${group.tools
                                .map(
                                    renderToolButton
                                )
                                .join("")}
                        </section>
                    `
                )
                .join("");
    } else {
        /*
         * Every discipline section leads with Select, so
         * each one can be left cleanly from the same
         * place. The remaining tools are unchanged.
         */
        const disciplineTools = [
            {
                id: "select",
                label: "Select",
                shortcut: "Esc"
            },

            ...engineeringTools[
                safeCategory
            ].map(
                label =>
                    toolDefinitionForLabel(
                        label
                    )
            )
        ];

        toolList.innerHTML =
            disciplineTools
                .map(
                    renderToolButton
                )
                .join("");
    }

    toolList
        .querySelectorAll(
            ".drawing-tool"
        )
        .forEach(
            button => {
                button.addEventListener(
                    "click",
                    event => {
                        const toolId =
                            button.dataset
                                .toolId;

                        if (
                            toolId ===
                            "coordinate-system"
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            openCoordinateSystemMenu(
                                button
                            );

                            return;
                        }

                        if (
                            toolId ===
                            "polygon"
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            openPolygonMenu(
                                button
                            );

                            return;
                        }

                        /*
                         * A Statics category opens its submenu
                         * and does not itself start a drawing
                         * operation; the child item does that.
                         */
                        if (
                            STATICS_TOOL_MENUS[
                                toolId
                            ]
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            openStaticsMenu(
                                button,
                                toolId
                            );

                            return;
                        }

                        if (
                            STATICS_ANALYSIS_TOOLS.includes(
                                toolId
                            )
                        ) {
                            event.preventDefault();

                            /*
                             * THE THREE DIAGRAMS ASK A SECOND QUESTION.
                             *
                             * Resultant and Force Components are CHILD
                             * analysis features: they read explicit Force
                             * feature(s) and derive everything from those, so
                             * they ARM as a tool and enter an INPUT-SELECTION
                             * state - "Select force" / "Select force(s)" - in
                             * which the student clicks the force(s) they mean
                             * and commits with Enter. Nothing is read from a
                             * previous selection or inferred from the cursor.
                             *
                             * A diagram is a thing to be placed and takes the
                             * ordinary body-then-click placement, so it is
                             * armed too - but only once Sketch or Plot has
                             * been chosen, which is what openAnalysisModeMenu
                             * does.
                             */
                            const isTemplate =
                                Boolean(
                                    ANALYSIS_DIAGRAM_TOOLS[
                                        toolId
                                    ]
                                );

                            if (isTemplate) {
                                openAnalysisModeMenu(
                                    button,
                                    { id: toolId }
                                );

                                return;
                            }

                            /*
                             * THE TOOL ARMS ITSELF. `runStaticsAnalysis` calls
                             * `beginAnalysisInput`, which sets the active tool,
                             * clears the selection and enters the input state -
                             * so no `setActiveTool("select")` is imposed here,
                             * which would fight the very arming the tool needs.
                             */
                            runStaticsAnalysis(
                                toolId
                            );

                            renderEngineeringTools(
                                activeCategory()
                            );

                            renderProperties();
                            renderCurrentDrawing();
                            return;
                        }

                        /*
                         * THE ARC TOOLS SHARE ONE SUBMENU.
                         *
                         * Reference Arc is an Arc child: same
                         * geometry engine, same interaction, same
                         * panel. What differs is only that the result
                         * is construction geometry, so the CHOICE of
                         * creation method offered here must be the
                         * choice Arc offers - not Arc's menu with a
                         * reduced copy, and not Arc's menu only.
                         *
                         * Routing both through one function is what
                         * keeps them from drifting apart: a mode added
                         * to the Arc menu appears on the Reference Arc
                         * menu because there is only one list.
                         */
                        if (
                            toolId ===
                                "arc" ||
                            toolId ===
                                "reference-arc"
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            openArcMenu(
                                button
                            );

                            return;
                        }

                        activateTool(
                            toolId
                        );
                    }
                );
            }
        );
}

export function setToolMessage(
    message
) {
    drawingToolMessage.textContent =
        message;
}
