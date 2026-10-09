import React, { useEffect, useRef, useState } from "react";
import type { Item, MediaAPI } from "../shared/types";
import { Poster, displayTitle } from "./posters";
import { runtimeLabel } from "../shared/classification";
export function describe(i: Item) {
  return [
    i.artwork?.selected?.year ?? i.year,
    i.kind === "episode"
      ? i.episode === null
        ? "TV episode"
        : `${i.season === null ? "Season ?" : `S${String(i.season).padStart(2, "0")}`} · E${String(i.episode).padStart(2, "0")}`
      : "Movie",
    runtimeLabel(i.runtimeSeconds),
    i.resolution,
  ]
    .filter(Boolean)
    .join(" · ");
}
export function Classification({
  item,
  disabled,
  change,
}: {
  item: Item;
  disabled: boolean;
  change: (value: "auto" | "movie" | "episode") => void;
}) {
  return (
    <label className="classification">
      Treat as{" "}
      <select
        aria-label={`Classification for ${item.title}`}
        disabled={disabled}
        value={item.manualKind ?? "auto"}
        onChange={(e) => change(e.target.value as "auto" | "movie" | "episode")}
      >
        <option value="auto">Automatic</option>
        <option value="movie">Movie</option>
        <option value="episode">TV episode</option>
      </select>
    </label>
  );
}
export function CollectionList({
  items,
  busy,
  details,
  open,
  toggle,
}: {
  items: Item[];
  busy: boolean;
  details: (i: Item) => void;
  open: (i: Item) => void;
  toggle: (i: Item) => void;
}) {
  return (
    <div className="list-scroll">
      <table className="collection-list">
        <caption className="sr-only">Your collection</caption>
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Type</th>
            <th scope="col">Runtime</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>
                <button className="list-title" onClick={() => details(i)}>
                  <span className="list-poster">
                    <Poster item={i} />
                  </span>
                  <span>
                    <strong>{displayTitle(i)}</strong>
                    <small>
                      {i.year ?? "Year unknown"}
                      {i.episode !== null &&
                        ` · S${i.season ?? "?"} E${i.episode}`}
                    </small>
                  </span>
                </button>
              </td>
              <td>
                {i.kind === "movie" ? "Movie" : "TV episode"}
                {i.manualKind && <small>Manual choice</small>}
              </td>
              <td
                title={
                  i.runtimeSeconds
                    ? `${i.runtimeSeconds.toFixed(1)} seconds`
                    : undefined
                }
              >
                {runtimeLabel(i.runtimeSeconds)}
              </td>
              <td>
                {i.watched ? "Watched" : "Unwatched"}
                <small>{i.available ? "Available" : "Unavailable"}</small>
                {i.review && <small>Needs review</small>}
              </td>
              <td>
                <div className="actions">
                  <button
                    disabled={busy || !i.available}
                    onClick={() => open(i)}
                  >
                    Open
                  </button>
                  <button disabled={busy} onClick={() => toggle(i)}>
                    {i.watched ? "Undo watched" : "Mark watched"}
                  </button>
                  <button onClick={() => details(i)}>Details</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function ItemDialog({
  item,
  api,
  busy,
  configured,
  isPick,
  close,
  open,
  toggle,
  classify,
  match,
  pickAgain,
  changed,
}: {
  item: Item;
  api?: MediaAPI;
  busy: boolean;
  configured: boolean;
  isPick: boolean;
  close: () => void;
  open: () => void;
  toggle: () => void;
  classify: (value: "auto" | "movie" | "episode") => void;
  match: () => void;
  pickAgain: () => void;
  changed: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    return () => d.close();
  }, []);
  useEffect(() => {
    setError("");
    if (
      !api ||
      item.kind !== "movie" ||
      item.artwork?.status !== "matched" ||
      !configured ||
      item.movieDetails
    )
      return;
    let alive = true;
    setLoading(true);
    api
      .movieDetails(item.id)
      .then(async () => {
        if (alive) await changed();
      })
      .catch((e) => {
        if (alive) setError(String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      setLoading(false);
    };
  }, [item.id, item.kind, item.artwork?.selected?.id, configured]);
  async function reload() {
    setLoading(true);
    setError("");
    try {
      await api!.movieDetails(item.id, true);
      await changed();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }
  const details = item.kind === "movie" ? item.movieDetails?.data : undefined;
  return (
    <dialog
      ref={dialog}
      className="modal item-dialog"
      aria-labelledby="item-heading"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <button
        className="close"
        aria-label="Close title details"
        onClick={close}
      >
        ×
      </button>
      <div className="eyebrow">
        {isPick ? "YOUR NEXT WATCH" : "IN YOUR COLLECTION"}
      </div>
      <div className="pick-cover">
        <Poster item={item} />
      </div>
      <h2 id="item-heading">{displayTitle(item)}</h2>
      <p>{describe(item)}</p>
      {item.episodeTitle && <p>{item.episodeTitle}</p>}
      <p>
        {item.watched
          ? "Added to your watch history."
          : isPick
            ? "Selected from your available, unwatched collection."
            : item.available
              ? "Available to watch."
              : "Reconnect your drive and rescan to open this title."}
      </p>
      <div className="modal-actions">
        <button
          className="primary"
          disabled={!api || busy || !item.available}
          onClick={open}
        >
          ▶ Open video
        </button>
        <button disabled={!api || busy} onClick={toggle}>
          {item.watched ? "Undo watched" : "Mark watched"}
        </button>
        {isPick && (
          <button disabled={busy} onClick={pickAgain}>
            Pick again
          </button>
        )}
      </div>
      <small>Opening a video never marks it watched.</small>
      <section className="detail-section">
        <h3>Collection settings</h3>
        <Classification item={item} disabled={!api || busy} change={classify} />
        <p>
          {item.classificationSource === "manual"
            ? "Your manual choice overrides automatic sorting."
            : item.classificationSource === "duration"
              ? "Classified as a TV episode because this file is under 80 minutes."
              : "Uses the filename classification; known runtimes under 80 minutes become TV episodes."}
        </p>
        {item.runtimeConflict && (
          <p className="review-text">
            Copies have different runtimes. Automatic sorting uses the longest
            available measured copy. Choose a type manually if needed.
          </p>
        )}
        {item.review && <p className="review-text">{item.review}</p>}
        <button
          className="poster-match-button"
          disabled={!api || busy || !configured}
          onClick={match}
        >
          {item.artwork?.status === "matched"
            ? "Change TMDB match"
            : "Find TMDB match"}
        </button>
        {item.artwork?.message && <p>{item.artwork.message}</p>}
      </section>
      {item.kind === "movie" && (
        <section className="detail-section">
          <h3>Movie details</h3>
          {loading && <p role="status">Loading movie details…</p>}
          {details ? (
            <>
              <p className="plot">
                {details.summary || "No plot summary available."}
              </p>
              <dl className="movie-facts">
                {details.directors.length > 0 && (
                  <>
                    <dt>Directed by</dt>
                    <dd>{details.directors.join(", ")}</dd>
                  </>
                )}
                {details.writers.length > 0 && (
                  <>
                    <dt>Written by</dt>
                    <dd>{details.writers.join(", ")}</dd>
                  </>
                )}
                {details.genres.length > 0 && (
                  <>
                    <dt>Genres</dt>
                    <dd>{details.genres.join(" · ")}</dd>
                  </>
                )}
                {details.releaseDate && (
                  <>
                    <dt>Release date</dt>
                    <dd>{details.releaseDate}</dd>
                  </>
                )}
                {details.language && (
                  <>
                    <dt>Original language</dt>
                    <dd>{details.language.toUpperCase()}</dd>
                  </>
                )}
                {details.listedRuntimeMinutes !== null && (
                  <>
                    <dt>TMDB runtime</dt>
                    <dd>
                      {details.listedRuntimeMinutes} minutes (catalogue listing)
                    </dd>
                  </>
                )}
                {details.rating !== null && (
                  <>
                    <dt>TMDB rating</dt>
                    <dd>
                      {details.rating.toFixed(1)} / 10 ·{" "}
                      {details.ratingCount.toLocaleString()} votes
                    </dd>
                  </>
                )}
              </dl>
              {details.cast.length > 0 && (
                <>
                  <h4>Starring</h4>
                  <ul className="cast-list">
                    {details.cast.map((c, n) => (
                      <li key={n}>
                        <strong>{c.name}</strong>
                        {c.character && <small>{c.character}</small>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          ) : (
            !loading && (
              <p>
                {item.artwork?.status !== "matched"
                  ? "Find and confirm the correct TMDB movie match to load its details."
                  : configured
                    ? "No movie details cached yet. Fetch them below."
                    : "Connect TMDB in Poster settings to load movie details."}
              </p>
            )
          )}
          {(error || item.movieDetails?.message) && (
            <p role="alert" className="review-text">
              {error || item.movieDetails?.message}
            </p>
          )}
          <button
            className="poster-match-button"
            disabled={
              !api ||
              busy ||
              loading ||
              !configured ||
              item.artwork?.status !== "matched"
            }
            onClick={() => void reload()}
          >
            {details ? "Refresh movie details" : "Fetch movie details"}
          </button>
        </section>
      )}
      <section className="detail-section">
        <h3>Files and actual runtime</h3>
        {(
          item.fileDetails ??
          item.paths.map((path) => ({ path, seconds: null, error: undefined }))
        ).map((f) => (
          <div className="file-detail" key={f.path}>
            <code>{f.path}</code>
            <small>
              {runtimeLabel(f.seconds)}
              {f.seconds !== null && ` · ${f.seconds.toFixed(1)} seconds`}
            </small>
            {f.error && <p className="review-text">{f.error}</p>}
          </div>
        ))}
      </section>
    </dialog>
  );
}
