//! Pure sync conflict decision logic (no I/O, no dependencies) so it is exhaustively unit-testable.
//! Principle: never silently discard user data. When both sides edited, remote wins in place and the
//! local edit is preserved as a separate conflict copy.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Local { pub base_version: i64, pub dirty: bool, pub deleted: bool, pub content_hash: u64 }
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Remote { pub version: i64, pub deleted: bool, pub content_hash: u64 }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Resolution {
    /// Remote unchanged since our base: send our change.
    PushLocal,
    /// We have no unsent edits: adopt remote.
    TakeRemote,
    /// Nothing to do.
    Noop,
    /// Both edited and differ: adopt remote, store local version as a new "conflict copy" row.
    KeepBothRemoteWins,
    /// Remote deleted but we edited: keep our edit (re-upsert) instead of losing it.
    ResurrectLocal,
}

pub fn resolve(l: &Local, r: &Remote) -> Resolution {
    let remote_changed = r.version > l.base_version;
    match (l.dirty, remote_changed) {
        (false, false) => Resolution::Noop,
        (false, true) => Resolution::TakeRemote,
        (true, false) => Resolution::PushLocal,
        (true, true) => {
            if r.deleted && !l.deleted { Resolution::ResurrectLocal }
            else if l.deleted { Resolution::TakeRemote }              // edit beats delete: remote edit survives
            else if l.content_hash == r.content_hash { Resolution::TakeRemote } // converged, no duplicate
            else { Resolution::KeepBothRemoteWins }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn l(base: i64, dirty: bool, deleted: bool, h: u64) -> Local { Local { base_version: base, dirty, deleted, content_hash: h } }
    fn r(v: i64, deleted: bool, h: u64) -> Remote { Remote { version: v, deleted, content_hash: h } }
    #[test] fn clean_and_unchanged() { assert_eq!(resolve(&l(3, false, false, 1), &r(3, false, 1)), Resolution::Noop); }
    #[test] fn clean_remote_newer() { assert_eq!(resolve(&l(3, false, false, 1), &r(4, false, 2)), Resolution::TakeRemote); }
    #[test] fn dirty_remote_same() { assert_eq!(resolve(&l(3, true, false, 9), &r(3, false, 1)), Resolution::PushLocal); }
    #[test] fn both_edited_differ_preserves_both() { assert_eq!(resolve(&l(3, true, false, 9), &r(5, false, 2)), Resolution::KeepBothRemoteWins); }
    #[test] fn both_edited_identical_no_duplicate() { assert_eq!(resolve(&l(3, true, false, 7), &r(4, false, 7)), Resolution::TakeRemote); }
    #[test] fn remote_deleted_local_edited_keeps_data() { assert_eq!(resolve(&l(3, true, false, 9), &r(4, true, 0)), Resolution::ResurrectLocal); }
    #[test] fn local_deleted_remote_edited_keeps_remote() { assert_eq!(resolve(&l(3, true, true, 0), &r(4, false, 2)), Resolution::TakeRemote); }
}
