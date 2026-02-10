// --- State ---
let root, selectedNode = null;
let i = 0;
const duration = 500;

// --- Layout ---
const PANEL_WIDTH = 380;
const margin = { top: 20, right: 20, bottom: 20, left: 40 };

function getTreeSize() {
    const w = window.innerWidth - PANEL_WIDTH - margin.left - margin.right;
    const h = window.innerHeight - margin.top - margin.bottom;
    return { width: Math.max(w, 400), height: Math.max(h, 300) };
}

// --- SVG Setup ---
const svgContainer = d3.select("#canvas");
const svg = svgContainer.append("svg");
const gZoom = svg.append("g");
const gTree = gZoom.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// Zoom behavior
const zoom = d3.zoom()
    .scaleExtent([0.2, 3])
    .on("zoom", (event) => gZoom.attr("transform", event.transform));
svg.call(zoom);

function resizeSVG() {
    const size = getTreeSize();
    svg.attr("width", size.width + margin.left + margin.right)
       .attr("height", size.height + margin.top + margin.bottom);
}
resizeSVG();

// --- Color palette by depth ---
const depthColors = [
    "#6366f1", // 0 - indigo
    "#3b82f6", // 1 - blue
    "#06b6d4", // 2 - cyan
    "#10b981", // 3 - emerald
    "#f59e0b", // 4 - amber
    "#ef4444", // 5 - red
    "#8b5cf6", // 6 - violet
    "#ec4899", // 7 - pink
];

function getColor(depth) {
    return depthColors[depth % depthColors.length];
}

// --- Node width calculation ---
function getNodeWidth(d) {
    return d.data.name.length * 8 + 24;
}

// --- Count all descendants ---
function countDescendants(d) {
    if (!d.children && !d._children) return 0;
    const ch = d.children || d._children || [];
    let count = ch.length;
    ch.forEach(c => count += countDescendants(c));
    return count;
}

// --- Count visible nodes for dynamic height ---
function countVisibleNodes(d) {
    if (!d.children) return 1;
    let count = 0;
    d.children.forEach(c => count += countVisibleNodes(c));
    return Math.max(count, 1);
}

// --- Detail panel rendering ---
function renderDetail(d) {
    const panel = d3.select("#detail-content");
    if (!d) {
        panel.html(`<div class="detail-empty">Click on a node to see its details</div>`);
        return;
    }
    const data = d.data;
    const color = getColor(d.depth);
    const childCount = (d.children || d._children || []).length;
    const totalDesc = countDescendants(d);

    let html = `
        <div class="detail-header" style="border-left: 4px solid ${color}; padding-left: 12px;">
            <div class="detail-name" style="color: ${color}">${data.name}</div>
            <div class="detail-header-file">${data.header || ''}</div>
        </div>
        <div class="detail-description">${data.description || ''}</div>
        <div class="detail-stats">
            <span class="stat-badge">Depth: ${d.depth}</span>
            ${childCount > 0 ? `<span class="stat-badge">Children: ${childCount}</span>` : ''}
            ${totalDesc > 0 ? `<span class="stat-badge">Total subtree: ${totalDesc}</span>` : ''}
        </div>
    `;

    if (data.properties && data.properties.length > 0) {
        html += `<div class="detail-section">
            <div class="detail-section-title">Properties</div>
            <ul class="detail-list detail-list-props">
                ${data.properties.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
            </ul>
        </div>`;
    }

    if (data.methods && data.methods.length > 0) {
        html += `<div class="detail-section">
            <div class="detail-section-title">Methods</div>
            <ul class="detail-list detail-list-methods">
                ${data.methods.map(m => `<li>${escapeHtml(m)}</li>`).join('')}
            </ul>
        </div>`;
    }

    // Ancestry path
    const path = [];
    let current = d;
    while (current) {
        path.unshift(current.data.name);
        current = current.parent;
    }
    if (path.length > 1) {
        html += `<div class="detail-section">
            <div class="detail-section-title">Inheritance</div>
            <div class="detail-breadcrumb">${path.join(' → ')}</div>
        </div>`;
    }

    panel.html(html);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// --- Search ---
const searchInput = document.getElementById("search-input");
const searchResults = document.getElementById("search-results");
let allNodes = [];

function flattenTree(node, arr) {
    arr.push(node);
    if (node.children) node.children.forEach(c => flattenTree(c, arr));
    if (node._children) node._children.forEach(c => flattenTree(c, arr));
}

function doSearch(query) {
    if (!query || query.length < 2) {
        searchResults.style.display = "none";
        return;
    }
    const q = query.toLowerCase();
    allNodes = [];
    flattenTree(root, allNodes);
    const matches = allNodes.filter(n => n.data.name.toLowerCase().includes(q)).slice(0, 10);
    if (matches.length === 0) {
        searchResults.style.display = "none";
        return;
    }
    searchResults.innerHTML = matches.map(n =>
        `<div class="search-item" data-name="${n.data.name}">${n.data.name}</div>`
    ).join('');
    searchResults.style.display = "block";
    searchResults.querySelectorAll('.search-item').forEach(el => {
        el.addEventListener('click', () => {
            const name = el.dataset.name;
            allNodes = [];
            flattenTree(root, allNodes);
            const target = allNodes.find(n => n.data.name === name);
            if (target) {
                expandToNode(target);
                selectNode(target);
                update(root);
                centerOnNode(target);
            }
            searchResults.style.display = "none";
            searchInput.value = '';
        });
    });
}

function expandToNode(node) {
    const path = [];
    let current = node.parent;
    while (current) {
        path.unshift(current);
        current = current.parent;
    }
    path.forEach(n => {
        if (n._children) {
            n.children = n._children;
            n._children = null;
        }
    });
}

function centerOnNode(node) {
    // Wait for transition to finish then center
    setTimeout(() => {
        const size = getTreeSize();
        const x = -(node.y) + size.width / 3;
        const y = -(node.x) + size.height / 2;
        svg.transition().duration(500).call(
            zoom.transform,
            d3.zoomIdentity.translate(x + margin.left, y + margin.top)
        );
    }, duration + 50);
}

searchInput.addEventListener('input', (e) => doSearch(e.target.value));
searchInput.addEventListener('blur', () => {
    setTimeout(() => searchResults.style.display = "none", 200);
});

// --- Collapse / Expand All ---
document.getElementById("btn-collapse").addEventListener("click", () => {
    collapseAll(root);
    root.children = root._children;
    root._children = null;
    update(root);
});

document.getElementById("btn-expand").addEventListener("click", () => {
    expandAll(root);
    update(root);
});

document.getElementById("btn-fit").addEventListener("click", fitView);

function collapseAll(d) {
    if (d.children) {
        d.children.forEach(collapseAll);
        d._children = d.children;
        d.children = null;
    }
}

function expandAll(d) {
    if (d._children) {
        d.children = d._children;
        d._children = null;
    }
    if (d.children) d.children.forEach(expandAll);
}

function fitView() {
    const size = getTreeSize();
    svg.transition().duration(500).call(
        zoom.transform,
        d3.zoomIdentity.translate(margin.left, margin.top).scale(1)
    );
}

// --- Select node ---
function selectNode(d) {
    selectedNode = d;
    renderDetail(d);
    // Highlight
    gTree.selectAll('g.node').classed('selected', false);
    gTree.selectAll('g.node')
        .filter(n => n === d)
        .classed('selected', true);
}

// --- Main update ---
function update(source) {
    const visibleCount = countVisibleNodes(root);
    const nodeHeight = 36;
    const treeHeight = Math.max(visibleCount * nodeHeight, getTreeSize().height);
    const treeWidth = getTreeSize().width;

    const treeMap = d3.tree()
        .size([treeHeight, treeWidth - 160])
        .separation((a, b) => a.parent === b.parent ? 1 : 1.2);

    const treeData = treeMap(root);
    const nodes = treeData.descendants();
    const links = treeData.descendants().slice(1);

    nodes.forEach(d => d.y = d.depth * 220);

    // --- Nodes ---
    const node = gTree.selectAll('g.node')
        .data(nodes, d => d.id || (d.id = ++i));

    const nodeEnter = node.enter().append('g')
        .attr('class', 'node')
        .attr("transform", `translate(${source.y0 || 0},${source.x0 || 0})`)
        .on('click', (event, d) => {
            event.stopPropagation();
            if (event.ctrlKey || event.metaKey) {
                // Toggle collapse with Ctrl/Cmd+click
                if (d.children) { d._children = d.children; d.children = null; }
                else if (d._children) { d.children = d._children; d._children = null; }
                update(d);
            } else {
                selectNode(d);
            }
        })
        .on('dblclick', (event, d) => {
            event.stopPropagation();
            if (d.children) { d._children = d.children; d.children = null; }
            else if (d._children) { d.children = d._children; d._children = null; }
            update(d);
        });

    // Node background pill
    nodeEnter.append('rect')
        .attr('class', 'node-bg')
        .attr('rx', 6)
        .attr('ry', 6)
        .attr('x', 0)
        .attr('y', -14)
        .attr('width', 16)
        .attr('height', 28);

    // Input port (left side)
    nodeEnter.append('circle')
        .attr('class', 'node-port-in')
        .attr('r', 4)
        .attr('cx', 0)
        .attr('cy', 0);

    nodeEnter.append('text')
        .attr('class', 'node-label')
        .attr("dy", ".35em")
        .attr("x", 12)
        .text(d => d.data.name);

    // Output port (right side, only visible when has children)
    nodeEnter.append('circle')
        .attr('class', 'node-port-out')
        .attr('r', 4)
        .attr('cy', 0);

    // Children count badge
    nodeEnter.append('text')
        .attr('class', 'node-badge')
        .attr("dy", ".35em");

    const nodeUpdate = nodeEnter.merge(node);

    nodeUpdate.transition().duration(duration)
        .attr("transform", d => `translate(${d.y},${d.x})`);

    nodeUpdate.select('.node-bg')
        .transition().duration(duration)
        .attr('width', d => getNodeWidth(d))
        .style("fill", d => {
            if (selectedNode === d) return getColor(d.depth);
            return d._children ? getColor(d.depth) + '22' : 'transparent';
        })
        .style("stroke", d => getColor(d.depth))
        .style("stroke-width", d => selectedNode === d ? '2px' : '1px');

    // Input port (left)
    nodeUpdate.select('.node-port-in')
        .style("fill", d => d.parent ? getColor(d.depth) : '#fff')
        .style("stroke", d => getColor(d.depth))
        .style("stroke-width", '2px')
        .style("display", d => d.parent ? 'block' : 'none');

    // Output port (right)
    nodeUpdate.select('.node-port-out')
        .attr('cx', d => getNodeWidth(d))
        .style("fill", d => {
            if (d._children) return getColor(d.depth);
            if (d.children) return '#fff';
            return 'none';
        })
        .style("stroke", d => (d.children || d._children) ? getColor(d.depth) : 'none')
        .style("stroke-width", '2px')
        .style("display", d => (d.children || d._children) ? 'block' : 'none');

    nodeUpdate.select('.node-label')
        .style("fill", d => selectedNode === d ? '#fff' : '#f1f5f9')
        .style("font-weight", d => selectedNode === d ? '700' : (d._children ? '600' : '500'));

    nodeUpdate.select('.node-badge')
        .text(d => {
            const count = (d._children || []).length;
            return count > 0 ? `+${count}` : '';
        })
        .style("fill", d => getColor(d.depth))
        .attr("x", d => getNodeWidth(d) + 10);

    nodeUpdate.classed('selected', d => selectedNode === d);

    const nodeExit = node.exit().transition().duration(duration)
        .attr("transform", `translate(${source.y},${source.x})`)
        .remove();

    nodeExit.select('.node-bg').style('opacity', 0);
    nodeExit.select('.node-indicator').style('opacity', 0);
    nodeExit.select('.node-label').style('opacity', 0);

    // --- Links ---
    const link = gTree.selectAll('path.link')
        .data(links, d => d.id);

    const linkEnter = link.enter().insert('path', "g")
        .attr("class", "link")
        .attr('d', () => {
            const o = { x: source.x0 || 0, y: source.y0 || 0, data: source.data };
            return diagonal(o, o);
        });

    link.merge(linkEnter).transition().duration(duration)
        .attr('d', d => diagonal(d, d.parent))
        .style('stroke', d => getColor(d.depth) + '55');

    link.exit().transition().duration(duration)
        .attr('d', () => {
            const o = { x: source.x, y: source.y, data: source.data };
            return diagonal(o, o);
        })
        .remove();

    nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });

    // s = child node, d = parent node
    // Link goes from parent's right port to child's left port
    function diagonal(s, d) {
        const parentRight = d.y + getNodeWidth(d);
        const childLeft = s.y;
        return `M ${childLeft} ${s.x}
                C ${(childLeft + parentRight) / 2} ${s.x},
                  ${(childLeft + parentRight) / 2} ${d.x},
                  ${parentRight} ${d.x}`;
    }
}

// --- Load data and init ---
fetch('data.json')
    .then(r => r.json())
    .then(treeData => {
        root = d3.hierarchy(treeData, d => d.children);
        root.x0 = getTreeSize().height / 2;
        root.y0 = 0;

        update(root);
        selectNode(root);
        fitView();
    })
    .catch(err => {
        console.error("Failed to load data.json:", err);
        d3.select("#detail-content").html(
            `<div class="detail-empty" style="color:#ef4444">Error loading data.json. Make sure to serve via HTTP (not file://).</div>`
        );
    });

// --- Resize ---
window.addEventListener('resize', () => {
    resizeSVG();
    if (root) update(root);
});

// Click on empty area to deselect
svg.on('click', () => {
    selectedNode = null;
    renderDetail(null);
    gTree.selectAll('g.node').classed('selected', false);
});
