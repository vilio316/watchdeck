import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Item, MediaAPI, Snapshot } from "../shared/types";
import "./style.css";
import {
  CollectionList,
  ItemDialog,
  Classification,
  describe,
} from "./collection";
import { AppearancePanel, applyAppearance } from "./appearance";
import { DEFAULT_APPEARANCE } from "../shared/appearance";
import type { Appearance } from "../shared/appearance";
import { Poster, PosterSettings, PosterMatcher, displayTitle } from "./posters";
declare global {
  interface Window {
    media?: MediaAPI;
  }
}
const initial: Snapshot = { items: [], roots: [] };
function App() {
  const api = window.media;
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE),
    [appearanceOpen, setAppearanceOpen] = useState(false);
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [settings, setSettings] = useState(false),
    [matching, setMatching] = useState<Item | null>(null),
    [configured, setConfigured] = useState(false);
  const [query, setQuery] = useState(""),
    [kind, setKind] = useState<"all" | "movie" | "episode">("all"),
    [filter, setFilter] = useState("all"),
    [detailId, setDetailId] = useState<string | null>(null),
    [isPick, setIsPick] = useState(false),
    [view, setView] = useState<"grid" | "list">(() => {
      try {
        return localStorage.getItem("watchdeck.collectionView") === "list"
          ? "list"
          : "grid";
      } catch {
        return "grid";
      }
    });
  async function refresh() {
    if (api) {
      setData(await api.snapshot());
      setConfigured((await api.posterSettings()).configured);
    }
  }
  async function perform(task: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      try {
        await refresh();
      } catch (e) {
        setError(String(e));
      }
      setBusy(false);
      setMessage("");
    }
  }
  useEffect(() => {
    void perform(async () => {});
    const offProgress = api?.onProgress(setMessage);
    const offArtwork = api?.onArtwork((update) =>
      setData((current) => ({
        ...current,
        items: current.items.map((i) =>
          update.ids.includes(i.id)
            ? { ...i, artwork: update.artwork, posterUrl: update.posterUrl }
            : i,
        ),
      })),
    );
    return () => {
      offProgress?.();
      offArtwork?.();
    };
  }, []);
  useEffect(() => {
    if (api)
      void api
        .appearance()
        .then(setAppearance)
        .catch(() =>
          setError(
            "Could not load appearance settings. You can choose them again.",
          ),
        );
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyAppearance(appearance, media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [appearance]);
  const available = data.items.filter((i) => i.available).length,
    watched = data.items.filter((i) => i.watched).length;
  const visible = data.items.filter(
    (i) =>
      (kind === "all" || i.kind === kind) &&
      `${i.title} ${i.artwork?.selected?.title ?? ""} ${i.episodeTitle ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "all" ||
        (filter === "unwatched" && !i.watched) ||
        (filter === "watched" && i.watched) ||
        (filter === "review" &&
          (!!i.review ||
            i.artwork?.status === "review" ||
            i.artwork?.status === "not_found" ||
            i.artwork?.status === "error"))),
  );
  function choose() {
    void perform(async () => {
      const item = await api!.pick(kind);
      setDetailId(item?.id ?? null);
      setIsPick(true);
      if (!item)
        setError(
          "No available, unwatched items qualify. Items needing review are excluded.",
        );
    });
  }
  const detailItem = data.items.find((i) => i.id === detailId);
  function showDetails(item: Item) {
    setDetailId(item.id);
    setIsPick(false);
  }
  function changeView(value: "grid" | "list") {
    setView(value);
    try {
      localStorage.setItem("watchdeck.collectionView", value);
    } catch {}
  }
  function toggle(item: Item) {
    void perform(async () => {
      await api!.watched(item.id, !item.watched);
    });
  }
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to collection
      </a>
      <aside>
        <a className="brand" href="#">
          ◈ <span>Watchdeck</span>
        </a>
        <div className="eyebrow">YOUR PERSONAL COLLECTION</div>
        <button
          className={filter === "all" ? "nav active" : "nav"}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          ▦ &nbsp; Library <span>{data.items.length}</span>
        </button>
        <button
          className={filter === "unwatched" ? "nav active" : "nav"}
          aria-pressed={filter === "unwatched"}
          onClick={() => setFilter("unwatched")}
        >
          ◷ &nbsp; Up next
        </button>
        <button
          className={filter === "watched" ? "nav active" : "nav"}
          aria-pressed={filter === "watched"}
          onClick={() => setFilter("watched")}
        >
          ✓ &nbsp; Watched <span>{watched}</span>
        </button>
        <button
          className={filter === "review" ? "nav active" : "nav"}
          aria-pressed={filter === "review"}
          onClick={() => setFilter("review")}
        >
          ◇ &nbsp; Needs review{" "}
          <span>
            {
              data.items.filter(
                (i) =>
                  i.review || (i.artwork && i.artwork.status !== "matched"),
              ).length
            }
          </span>
        </button>
        <div className="roots">
          <div className="eyebrow">LIBRARY FOLDERS</div>
          {data.roots.length === 0 && <p>No folders connected yet.</p>}
          {data.roots.map((root) => (
            <div className="root" key={root.id}>
              <strong title={root.path}>{root.path}</strong>
              <small>
                {root.status === "online"
                  ? "● Last scan succeeded"
                  : root.status === "error"
                    ? "● Scan failed / unavailable"
                    : "○ Not scanned"}
                {root.lastScan &&
                  ` · ${new Date(root.lastScan).toLocaleDateString()}`}
              </small>
              {root.error && <p className="root-error">{root.error}</p>}
              <div className="root-actions">
                <button
                  disabled={busy}
                  onClick={() => void perform(() => api!.scan(root.id))}
                >
                  Rescan
                </button>
                <button
                  title="Choose the same folder at its new location. This changes the root mapping."
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Relink this root to the SAME media folder at its new location?",
                      )
                    )
                      void perform(() => api!.addRoot(root.id));
                  }}
                >
                  Relink
                </button>
              </div>
            </div>
          ))}
          <button
            className="outline"
            disabled={busy || !api}
            onClick={() => void perform(() => api!.addRoot())}
          >
            + Add media folder
          </button>
        </div>
        <div className="version">
          LOCAL · PRIVATE · v0.3.0
          <br />
          Posters from TMDB
        </div>
      </aside>
      <main id="main-content">
        <header>
          <div>
            <div className="eyebrow">LESS SCROLLING. MORE WATCHING.</div>
            <h1>Your next great watch.</h1>
            <p>
              A little order for your collection. A little chance for your
              evening.
            </p>
          </div>
          <div className="header-actions">
            <button
              className="outline settings-button"
              onClick={() => setAppearanceOpen(true)}
            >
              Appearance
            </button>
            <button
              className="outline settings-button"
              disabled={!api || busy}
              onClick={() => setSettings(true)}
            >
              Poster settings
            </button>
          </div>
        </header>
        {!api && (
          <div className="notice">
            Browser preview only. Launch with <code>npm start</code> to connect
            your Windows folders.
          </div>
        )}
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {busy && (
          <div role="status" className="notice">
            {message || "Working…"}
            {message.startsWith("Fetching posters") && (
              <button
                className="stop-posters"
                onClick={() => void api!.cancelPosters()}
              >
                Stop after this title
              </button>
            )}
          </div>
        )}
        <section className="hero">
          <div>
            <div className="eyebrow">LET CHANCE TAKE THE REMOTE</div>
            <h2>
              Can’t decide?
              <br />
              We’ve got the next pick.
            </h2>
            <p>
              Available, unwatched movies and the next episode
              <br />
              of a series. Your history stays yours.
            </p>
            <button
              className="primary"
              disabled={!api || busy || !available}
              onClick={choose}
            >
              ↝ &nbsp; Pick something for me
            </button>
            <small>Uses the Movies / TV selection below.</small>
          </div>
          <div className="ticket">
            <div className="ticket-top">
              TONIGHT’S PLAN <span>✦</span>
            </div>
            <div className="ticket-symbol">▶</div>
            <h3>
              A good story.
              <br />
              Chosen for you.
            </h3>
            <div className="ticket-bottom">NO REPEATS BY DEFAULT &nbsp; ✧</div>
          </div>
        </section>
        <div className="stats">
          <div>
            <strong>
              {data.items.filter((i) => i.kind === "movie").length}
            </strong>
            <span>movies</span>
          </div>
          <div>
            <strong>
              {data.items.filter((i) => i.kind === "episode").length}
            </strong>
            <span>episodes</span>
          </div>
          <div>
            <strong>{available}</strong>
            <span>available after scan</span>
          </div>
          <div>
            <strong>{watched}</strong>
            <span>watched</span>
          </div>
        </div>
        <section>
          <div className="catalogue-heading">
            <h2>
              {filter === "watched"
                ? "Your watch history"
                : filter === "review"
                  ? "Needs a closer look"
                  : "The collection"}{" "}
              <span>{visible.length}</span>
            </h2>
            <input
              aria-label="Search titles"
              placeholder="Search a title…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="toolbar">
            <div className="segmented">
              {(["all", "movie", "episode"] as const).map((k) => (
                <button
                  key={k}
                  className={kind === k ? "selected" : ""}
                  onClick={() => setKind(k)}
                >
                  {k === "all"
                    ? "Everything"
                    : k === "movie"
                      ? "Movies"
                      : "TV episodes"}
                </button>
              ))}
            </div>
            <div className="segmented" aria-label="Collection view">
              {(["grid", "list"] as const).map((v) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  className={view === v ? "selected" : ""}
                  onClick={() => changeView(v)}
                >
                  {v === "grid" ? "Grid view" : "List view"}
                </button>
              ))}
            </div>
            <small>
              <button
                disabled={busy || !api || !data.roots.length}
                onClick={() => void perform(() => api!.inspectRuntimes())}
              >
                Read runtimes
              </button>{" "}
              ·{" "}
              {configured ? "TMDB token saved" : "Connect TMDB to add posters"}{" "}
              ·{" "}
              <button
                disabled={busy || !api || !configured}
                onClick={() => void perform(() => api!.syncPosters())}
              >
                Fetch posters
              </button>
            </small>
          </div>
          {visible.length === 0 ? (
            <div className="empty">
              <div>▦</div>
              <h3>
                {data.items.length
                  ? "No titles match these filters."
                  : "Your collection starts here."}
              </h3>
              <p>
                {data.items.length
                  ? "Try another title or switch your filters."
                  : "Choose your external drive or a media folder. We’ll find videos in its subfolders too."}
              </p>
              {!data.items.length && (
                <button
                  className="primary"
                  disabled={busy || !api}
                  onClick={() => void perform(() => api!.addRoot())}
                >
                  Choose media folder
                </button>
              )}
            </div>
          ) : view === "list" ? (
            <CollectionList
              items={visible}
              busy={busy}
              details={showDetails}
              open={(i) => void perform(() => api!.open(i.id))}
              toggle={toggle}
            />
          ) : (
            <div className="cards">
              {visible.map((item) => (
                <article className="card" key={item.id}>
                  <button
                    className="poster-details"
                    aria-label={`Show details for ${displayTitle(item)}`}
                    onClick={() => showDetails(item)}
                  >
                    <Poster item={item} />
                  </button>
                  <div className="card-body">
                    <h3>
                      <button
                        className="title-details"
                        onClick={() => showDetails(item)}
                      >
                        {displayTitle(item)}
                      </button>
                    </h3>
                    {displayTitle(item) !== item.title && (
                      <p>File title: {item.title}</p>
                    )}
                    <p>{describe(item)}</p>
                    {item.episodeTitle && <p>{item.episodeTitle}</p>}
                    <div className="badges">
                      <span
                        className={item.available ? "available" : "missing"}
                      >
                        {item.available ? "Available" : "Unavailable"}
                      </span>
                      {item.watched && <span className="seen">Watched</span>}
                      {item.review && (
                        <span className="review" title={item.review}>
                          Needs review
                        </span>
                      )}
                    </div>
                    {item.review && (
                      <p className="review-text">{item.review}</p>
                    )}
                    <button
                      className="poster-match-button"
                      disabled={!api || busy || !configured}
                      onClick={() => setMatching(item)}
                    >
                      {item.artwork?.status === "matched"
                        ? "Change poster match"
                        : "Find poster"}
                    </button>
                    {item.artwork?.message && (
                      <p className="review-text">{item.artwork.message}</p>
                    )}
                    <Classification
                      item={item}
                      disabled={!api || busy}
                      change={(value) =>
                        void perform(() => api!.classify(item.id, value))
                      }
                    />
                    <button
                      className="poster-match-button"
                      onClick={() => showDetails(item)}
                    >
                      Details
                    </button>
                    <details>
                      <summary>
                        File location{item.paths.length > 1 ? "s" : ""}
                      </summary>
                      {item.paths.map((p) => (
                        <code key={p}>{p}</code>
                      ))}
                    </details>
                    <div className="actions">
                      <button
                        disabled={busy || !item.available}
                        onClick={() => void perform(() => api!.open(item.id))}
                      >
                        ▶ Open
                      </button>
                      <button disabled={busy} onClick={() => toggle(item)}>
                        {item.watched ? "Undo watched" : "✓ Mark watched"}
                      </button>
                    </div>
                    {item.watchedAt && (
                      <small>
                        Watched {new Date(item.watchedAt).toLocaleDateString()}
                      </small>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <footer>
          Opening a video never marks it watched. Rescan after changes or
          reconnecting your drive.
          <details className="credits">
            <summary>About & credits</summary>
            <img src="./tmdb-logo.svg" alt="TMDB" />
            <p>Movie details and movie / TV artwork provided by TMDB.</p>
            <p>
              This product uses the TMDB API but is not endorsed or certified by
              TMDB.
            </p>
            <p>
              Poster matching sends parsed titles and years to TMDB; video files
              and full file paths stay on your computer.
            </p>
          </details>
        </footer>
      </main>
      {appearanceOpen && (
        <AppearancePanel
          api={api}
          settings={appearance}
          preview={setAppearance}
          close={(saved) => {
            setAppearance(saved);
            setAppearanceOpen(false);
          }}
        />
      )}
      {settings && api && (
        <PosterSettings
          api={api}
          configured={configured}
          close={() => setSettings(false)}
          changed={refresh}
        />
      )}{" "}
      {matching && api && (
        <PosterMatcher
          item={matching}
          api={api}
          close={() => setMatching(null)}
          changed={refresh}
        />
      )}{" "}
      {detailItem && (
        <ItemDialog
          key={detailItem.id}
          item={detailItem}
          api={api}
          busy={busy}
          configured={configured}
          isPick={isPick}
          close={() => setDetailId(null)}
          open={() => void perform(() => api!.open(detailItem.id))}
          toggle={() => toggle(detailItem)}
          classify={(value) =>
            void perform(() => api!.classify(detailItem.id, value))
          }
          match={() => {
            setDetailId(null);
            setMatching(detailItem);
          }}
          pickAgain={choose}
          changed={refresh}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
