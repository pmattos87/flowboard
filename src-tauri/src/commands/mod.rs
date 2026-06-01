use serde::{Deserialize, Deserializer};

pub mod activity_log;
pub mod attachments;
pub mod comments;
pub mod dev;
pub mod people;
pub mod projects;
pub mod sprints;
pub mod tasks;
pub mod time_logs;

/// Distinguishes "field absent" from "field present and null" when deserializing
/// into `Option<Option<T>>`. Without this, serde's default impl collapses both
/// cases to `None`, making it impossible to clear a nullable column via JSON null.
pub(crate) fn deserialize_optional_field<'de, T, D>(
    deserializer: D,
) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}
