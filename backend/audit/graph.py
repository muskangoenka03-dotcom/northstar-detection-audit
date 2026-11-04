"""Identity graph: who is connected to what, and why.

Nodes   user:<id>          a person in user_identities / user_audit_log
        id:<value>         an identifier: email, phone (tel:<digits>) or email hash
        res:<resource_id>  a record in some system
Edges   user - id    the identifier belongs (or belonged) to the user
        res  - id    evidence shows the identifier inside the record
        res  - user  the record names the user id, or the data catalog links them
        res  - res   one record recreated another (sync / restore "repopulated")

A deletion subject's footprint is everything reachable from their user node without
passing through an identifier shared with another person, or into a record that the
evidence ties to someone else. Each reached record keeps the path that explains it.
"""
import re
from collections import defaultdict, deque

from .parsers import system_of

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


class IdentityGraph:
    def __init__(self, ids):
        self.ids = ids
        self.adj = defaultdict(dict)          # node -> {neighbour: (kind, source)}
        for u in ids.users.values():
            for e in u["emails"] - {None}:
                self.add(f"user:{u['user_id']}", f"id:{e}", "identity", "user_identities")
            for h in u["hashes"] - {None, ""}:
                self.add(f"user:{u['user_id']}", f"id:{h}", "identity", "user_identities")
            for p in u["phones"]:
                self.add(f"user:{u['user_id']}", f"id:tel:{p}", "identity", "user_identities")

    def add(self, a, b, kind, source):
        if b not in self.adj[a]:
            self.adj[a][b] = (kind, source)
            self.adj[b][a] = (kind, source)

    def keys(self, value):
        """Identifier / user nodes an evidence value refers to."""
        from .engine import norm, digits
        s = norm(value)
        if not s:
            return []
        out = []
        if s in self.ids.by_key:
            out.append(f"user:{s}" if s.startswith("user_") else f"id:{s}")
        p = digits(value) if "@" not in s and not s.startswith(("user_", "account_")) and len(s) < 25 else None
        if p and "tel:" + p in self.ids.by_key:
            out.append(f"id:tel:{p}")
        for e in EMAIL.findall(s):
            e = e.rstrip(".")
            if e in self.ids.by_key and f"id:{e}" not in out:
                out.append(f"id:{e}")
        return out

    def link_observation(self, o, field, value):
        for k in self.keys(value):
            self.add(f"res:{o['resource_id']}", k, field, o["evidence_id"])

    def owners(self, node):
        """Users an identifier or record is directly tied to."""
        if node.startswith("user:"):
            return {node[5:]}
        if node.startswith("id:"):
            return set(self.ids.by_key.get(node[3:], ()))
        return {n[5:] for n in self.adj[node] if n.startswith("user:")} | \
            {u for n in self.adj[node] if n.startswith("id:") for u in self.ids.by_key.get(n[3:], ())}

    def footprint(self, uid, max_depth=4):
        """Records reachable from the user -> {resource_id: path}, path = [(node, kind, source), ...]."""
        start = f"user:{uid}"
        seen, out = {start: []}, {}
        q = deque([start])
        while q:
            node = q.popleft()
            path = seen[node]
            if len(path) >= max_depth:
                continue
            for nb, (kind, source) in self.adj[node].items():
                if nb in seen or nb.startswith("user:"):
                    continue
                own = self.owners(nb)
                if own and own != {uid}:           # shared identifier or someone else's record
                    continue
                seen[nb] = path + [(nb, kind, source)]
                if nb.startswith("res:"):
                    out[nb[4:]] = seen[nb]
                q.append(nb)
        return out

    def subgraph(self, uid, resources):
        """Nodes and edges of one subject's footprint, for drawing."""
        keep = {f"user:{uid}"} | {f"res:{r}" for r in resources}
        for r in resources:
            keep |= {n for n in self.adj[f"res:{r}"] if n.startswith("id:") and self.owners(n) <= {uid}}
        keep |= {n for n in self.adj[f"user:{uid}"] if n.startswith("id:")}
        nodes = [{"id": n, "type": n.split(":")[0], "label": n.split(":", 1)[1],
                  "system": system_of(n[4:]) if n.startswith("res:") else None} for n in sorted(keep)]
        edges, done = [], set()
        for a in keep:
            for b, (kind, source) in self.adj[a].items():
                if b in keep and (b, a) not in done:
                    done.add((a, b))
                    edges.append({"source": a, "target": b, "kind": kind, "evidence": source})
        return {"nodes": nodes, "edges": edges}
