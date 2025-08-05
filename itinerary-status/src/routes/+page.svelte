<script lang="ts">
  import { db } from '$lib/firebase';
  import { doc, onSnapshot } from 'firebase/firestore';
  import { writable } from 'svelte/store';

  let jobId = '';
  let listening = false;
  const status = writable<string | null>(null);
  const itinerary = writable<any[] | null>(null);
  const error = writable<string | null>(null);

  function listenToJob() {
    if (!jobId) return;
    listening = true;

    const jobRef = doc(db, 'itineraries', jobId);

    onSnapshot(jobRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        status.set(data.status);
        itinerary.set(data.itinerary || null);
        error.set(data.error || null);
      } else {
        status.set(null);
        itinerary.set(null);
        error.set('No job found with this ID.');
      }
    });
  }
</script>

<div class="p-6 max-w-lg mx-auto">
  <h1 class="text-2xl font-bold mb-4">Check Itinerary Status</h1>

  <input
    type="text"
    bind:value={jobId}
    placeholder="Enter Job ID"
    class="border rounded p-2 w-full mb-4"
  />
  <button
    on:click={listenToJob}
    class="bg-blue-500 text-white px-4 py-2 rounded"
  >
    Track Job
  </button>

  {#if listening}
    <div class="mt-6">
      <p>Status: {$status || 'Unknown'}</p>
      {#if $error}<p class="text-red-500">Error: {$error}</p>{/if}

      {#if $status === 'completed' && $itinerary}
        <h2 class="text-xl font-semibold mt-4">Itinerary:</h2>
        <ul>
          {#each $itinerary as day}
            <li class="border p-2 my-2 rounded">
              <strong>Day {day.day}:</strong> {day.theme}
              <ul class="ml-4">
                {#each day.activities as act}
                  <li>{act.time} - {act.description} ({act.location})</li>
                {/each}
              </ul>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
